import {
  Body,
  Controller,
  HttpException,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PassThrough } from 'stream';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { WorkflowChatDto } from '../dto/workflow-chat.dto';
import { WorkflowAgentService } from './workflow-agent.service';

/**
 * 工作流 Agent：DeepSeek 规划 prompt + Flow 图，SSE 下发；生图由前端节点 Run。
 *
 * 注意：必须走 `reply.send(PassThrough)`，不能 `reply.raw.flushHeaders/write`。
 * 否则会绕过 @fastify/cors，浏览器把缺 ACAO 头的响应误报成 CORS error。
 */
@UseGuards(ApiKeyOrJwtGuard)
@Controller('ai')
export class WorkflowAgentController {
  private readonly logger = new Logger(WorkflowAgentController.name);

  constructor(private readonly workflowAgent: WorkflowAgentService) {}

  @Post('workflow-chat')
  async workflowChat(
    @Body() dto: WorkflowChatDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const prompt = String(dto.prompt || '').trim();
    if (!prompt) {
      throw new HttpException({ message: 'prompt 不能为空' }, 400);
    }

    const viewportCenter =
      typeof dto.viewportCenterX === 'number' &&
      typeof dto.viewportCenterY === 'number' &&
      Number.isFinite(dto.viewportCenterX) &&
      Number.isFinite(dto.viewportCenterY)
        ? { x: dto.viewportCenterX, y: dto.viewportCenterY }
        : undefined;

    const stream = new PassThrough();
    let seq = 0;
    const writeEvent = (body: Record<string, unknown>) => {
      seq += 1;
      stream.write(`data: ${JSON.stringify({ seq, body })}\n\n`);
    };

    reply.header('Content-Type', 'text/event-stream; charset=utf-8');
    reply.header('Cache-Control', 'no-cache, no-transform');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
    // 走 Fastify 响应管道，保留 CORS 头（与 architecture-chat 的 reply.send 一致）
    reply.send(stream);

    try {
      writeEvent({
        type: 'tool.status',
        name: 'workflow_plan',
        message: '正在用 DeepSeek 规划提示词与节点…',
        progress: { percent: 15 },
      });

      const plan = await this.workflowAgent.planWorkflow({
        prompt,
        referenceImageUrls: dto.referenceImageUrls,
        viewportCenter,
      });

      const message = plan.message || '';
      const chunkSize = 48;
      for (let i = 0; i < message.length; i += chunkSize) {
        writeEvent({
          type: 'assistant.delta',
          delta: message.slice(i, i + chunkSize),
        });
      }
      writeEvent({ type: 'assistant.message', message });

      if (plan.command) {
        writeEvent({
          type: 'tool.status',
          name: 'apply_flow',
          message: '正在画布创建节点并生成…',
          progress: { percent: 55 },
        });
        writeEvent({
          type: 'flow.command',
          command: plan.command,
        });
      }

      writeEvent({ type: 'done' });
      stream.write('event: done\ndata: {}\n\n');
      stream.end();
    } catch (error: any) {
      const msg =
        error instanceof HttpException
          ? (error.getResponse() as any)?.message || error.message
          : error?.message || 'workflow agent failed';
      const text = Array.isArray(msg) ? msg.join('; ') : String(msg);
      this.logger.error(`workflow-chat 失败: ${text}`);

      try {
        writeEvent({ type: 'error', message: text });
        stream.write('event: done\ndata: {}\n\n');
        stream.end();
      } catch {
        try {
          stream.destroy();
        } catch {
          // ignore
        }
      }
    }
  }
}
