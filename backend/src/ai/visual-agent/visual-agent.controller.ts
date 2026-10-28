import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsArray, IsOptional, IsString, MaxLength, ArrayMaxSize, MinLength } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PassThrough } from 'node:stream';
import { VisualAgentService } from './visual-agent.service';

class CreateVisualSessionDto {
  @IsString() @MinLength(1) @MaxLength(100) projectId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) title?: string;
}

class VisualMessageDto {
  @IsString() @MinLength(1) @MaxLength(12000) prompt!: string;
  @IsString() @MinLength(1) @MaxLength(100) requestId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) referenceUrls?: string[];
}

type AuthRequest = FastifyRequest & { user: { id: string; role?: string } };

@UseGuards(AuthGuard('jwt'))
@Controller('ai/visual-agent')
export class VisualAgentController {
  constructor(private readonly service: VisualAgentService) {}

  @Get('config') config(@Req() req: AuthRequest) { return this.service.availability(req.user.role === 'admin'); }
  @Get('sessions') list(@Req() req: AuthRequest, @Query('projectId') projectId: string) { return this.service.list(req.user.id, projectId || ''); }
  @Post('sessions') create(@Req() req: AuthRequest, @Body() dto: CreateVisualSessionDto) { return this.service.create(req.user.id, dto.projectId, dto.title); }
  @Get('sessions/:id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.get(req.user.id, id); }
  @Post('sessions/:id/messages') send(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: VisualMessageDto) { return this.service.sendMessage(req.user.id, id, dto); }
  @Post('sessions/:id/interrupt') interrupt(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.interrupt(req.user.id, id); }
  @Post('sessions/:id/sync') sync(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.syncArtifacts(req.user.id, id); }
  @Delete('sessions/:id') remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req.user.id, id); }

  @Get('sessions/:id/events')
  async events(@Req() req: AuthRequest, @Param('id') id: string, @Res() reply: FastifyReply) {
    // Authorize before sending headers. Snapshots are replayable and contain Tanva URLs only.
    const initial = await this.service.get(req.user.id, id);
    const stream = new PassThrough();
    reply.header('Content-Type', 'text/event-stream; charset=utf-8');
    reply.header('Cache-Control', 'no-cache, no-transform');
    reply.header('X-Accel-Buffering', 'no');
    reply.send(stream); // retain Fastify CORS handling
    let closed = false;
    let previous = JSON.stringify(initial);
    let busy = false;
    stream.write(`event: snapshot\ndata: ${previous}\n\n`);
    const timer = setInterval(async () => {
      if (closed || busy) return;
      busy = true;
      try {
        const snapshot = JSON.stringify(await this.service.get(req.user.id, id));
        if (!closed && snapshot !== previous) {
          previous = snapshot;
          if (!stream.write(`event: snapshot\ndata: ${snapshot}\n\n`)) {
            await new Promise<void>(resolve => {
              const drained = () => { stream.off('drain', drained); stream.off('close', drained); resolve(); };
              stream.once('drain', drained);
              stream.once('close', drained);
            });
          }
        } else if (!closed) stream.write(': keepalive\n\n');
      } catch {
        if (!closed) { stream.write('event: error\ndata: {"message":"无法读取创作会话，请刷新重试"}\n\n'); stream.end(); cleanup(); }
      } finally { busy = false; }
    }, 2000);
    const cleanup = () => { closed = true; clearInterval(timer); stream.destroy(); };
    reply.raw.on('close', cleanup);
    stream.on('error', cleanup);
  }
}
