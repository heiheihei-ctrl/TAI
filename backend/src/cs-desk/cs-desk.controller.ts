import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CsDeskService } from './cs-desk.service';
import {
  CreateConversationDto,
  RespondCollabDto,
  SendMessageDto,
} from './dto/cs-desk.dto';

type AuthUser = {
  sub?: string;
  id?: string;
  role?: string;
};

type AuthenticatedRequest = FastifyRequest & { user: AuthUser };

@ApiTags('cs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cs')
export class CsDeskController {
  constructor(private readonly csDesk: CsDeskService) {}

  private userId(req: AuthenticatedRequest): string {
    return String(req.user?.sub || req.user?.id || '');
  }

  @Post('conversations')
  @ApiOperation({ summary: '用户创建/获取进行中客服会话' })
  async createConversation(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateConversationDto,
  ) {
    return this.csDesk.getOrCreateOpenConversation(
      this.userId(req),
      body.initialMessage,
    );
  }

  @Get('conversations/mine')
  @ApiOperation({ summary: '用户会话列表' })
  async listMine(@Request() req: AuthenticatedRequest) {
    return this.csDesk.listMine(this.userId(req));
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: '用户查看会话' })
  async getOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.csDesk.getConversationForUser(id, this.userId(req));
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '用户拉取消息' })
  async listMessages(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.csDesk.listMessages(id, {
      userId: this.userId(req),
      isAgent: false,
    });
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: '用户发送消息' })
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.csDesk.sendUserMessage(id, this.userId(req), body);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: '用户标记已读' })
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.csDesk.markRead(id, {
      userId: this.userId(req),
      isAgent: false,
    });
  }

  @Post('collab/:id/respond')
  @ApiOperation({ summary: '用户响应协同请求' })
  async respondCollab(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RespondCollabDto,
  ) {
    return this.csDesk.respondCollab(
      id,
      this.userId(req),
      body.action,
      body.projectId,
    );
  }

  @Get('service-packages')
  @ApiOperation({ summary: '公开服务包目录（用户可见）' })
  async listPackages() {
    this.csDesk.assertLinglongEnabled();
    return this.csDesk.listServicePackages();
  }
}
