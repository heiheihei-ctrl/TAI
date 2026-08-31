import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import axios from 'axios';
import { ApiKeyOrJwtGuard } from '../auth/guards/api-key-or-jwt.guard';
import { ArchitectureChatDto } from './dto/architecture-chat.dto';

/**
 * 建筑设计 AI（tgagent）BFF 转发入口。
 *
 * ## 为什么走 BFF，而不是让前端直连 tgagent
 *
 * ① **计费**：tgagent 回调 TAI 生图接口时必须携带**用户 JWT** 才会扣积分。
 *    apiKey 路径不扣费——`getUserId()`（ai.controller.ts:725）开头即
 *    `if (req.apiClient) return null`，随后 :5555 `if (!userId)` 跳过扣费。
 * ② **鉴权与审计**统一收口在平台侧。
 * ③ tgagent 是 ESM 独立进程，无法作为 NestJS module 嵌入（本后端为 CommonJS）。
 *
 * ## 流式
 *
 * 以 SSE 管道转发，事件格式与 tgagent `POST /chat` 完全一致
 * （`data: {seq, body}` 帧 + 结尾 `event: done`）。
 *
 * ⚠️ 运行验证待做：类型检查已通过（2026-08-29，`tsc -p tsconfig.build.json --noEmit`，
 * 依赖已安装）；但本后端缺 `.env` 与数据库、无法启动，运行期行为
 * （Fastify 流式写法、守卫行为、axios 流管道）尚未联调过。
 */
@UseGuards(ApiKeyOrJwtGuard)
@Controller('ai')
export class ArchitectureController {
  private readonly logger = new Logger(ArchitectureController.name);

  constructor(private readonly config: ConfigService) {}

  @Post('architecture-chat')
  async architectureChat(
    @Body() dto: ArchitectureChatDto,
    @Req() req: any,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const baseUrl = (this.config.get<string>('TGAGENT_BASE_URL') || '')
      .trim()
      .replace(/\/+$/, '');
    if (!baseUrl) {
      throw new HttpException(
        { message: 'TGAGENT_BASE_URL 未配置（tgagent 服务根地址，如 http://127.0.0.1:8712）' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 透传用户凭证：tgagent 回调生图接口时用它扣用户积分。
    // ⚠️ 绝不要同时带 x-api-key——守卫中 apiKey 判断优先（api-key-or-jwt.guard.ts:29），
    // 命中后不解析 JWT、req.user 为空 → 静默免单。
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const accessToken = this.extractAccessToken(req);
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const teamId = req?.headers?.['x-team-id'] ?? req?.headers?.['X-Team-Id'];
    if (typeof teamId === 'string' && teamId.trim()) {
      headers['X-Team-Id'] = teamId.trim();
    }

    // 服务间鉴权：tgagent 配了 BFF_SECRET 之后 /chat 会校验 x-bff-token，
    // 不转发就是全线 401。tgagent 未配置时该值为空，不发此头（保持本地直连可用）。
    const bffSecret = (this.config.get<string>('TGAGENT_BFF_SECRET') || '').trim();
    if (bffSecret) headers['x-bff-token'] = bffSecret;

    // 稳定用户标识：tgagent 默认用 sha256(bearer) 派生会话归属，
    // 而 access token 只有 900s（JWT_ACCESS_TTL）就刷新一次，
    // token 一换会话键就变，上一轮的图与需求档案全部失联。
    // 这里把 JWT 的 subject 透传过去，让会话跟随用户而不是跟随 token。
    const userId = this.extractUserId(req);
    if (userId) headers['X-User-Id'] = userId;

    try {
      const upstream = await axios.post(
        `${baseUrl}/chat`,
        {
          projectId: dto.projectId,
          sessionId: dto.sessionId,
          text: dto.prompt,
          selectionRefs: dto.selectionRefs,
          attachments: dto.attachments,
          // 补发游标：取回上一轮 SSE 关闭之后才产生的事件（视频完成等）
          lastSeq: dto.lastSeq,
        },
        {
          headers,
          responseType: 'stream',
          // 单轮上限：tgagent 侧 /chat 上限 180s，这里留出余量
          timeout: 200_000,
        },
      );

      reply.header('Content-Type', 'text/event-stream; charset=utf-8');
      reply.header('Cache-Control', 'no-cache, no-transform');
      reply.header('Connection', 'keep-alive');
      reply.header('X-Accel-Buffering', 'no');
      reply.send(upstream.data);
    } catch (error: any) {
      const status = error?.response?.status as number | undefined;
      const detail =
        typeof error?.response?.data === 'string'
          ? error.response.data.slice(0, 300)
          : (error?.message as string | undefined) ?? 'unknown';

      this.logger.error(`architecture-chat 转发失败: ${detail}`);

      const mapped =
        status && status >= 400 && status < 500
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.BAD_GATEWAY;
      throw new HttpException({ message: `建筑设计服务不可用: ${detail}` }, mapped);
    }
  }

  /**
   * 取稳定的用户标识（JWT subject）。
   * 仅 JWT 链路有值；apiKey 链路（req.apiClient）下返回 null，由 tgagent 回退到 bearer 派生。
   */
  private extractUserId(req: any): string | null {
    const user = req?.user;
    const candidate = user?.sub ?? user?.id ?? user?.userId;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  }

  /**
   * 取用户 access token。
   * 与 ai.controller.ts:424 `extractAccessToken` 同逻辑：cookie 优先，其次 Bearer 头。
   * 注意：本后端为 Fastify，cookie 需 @fastify/cookie 插件注册后才可读，故做防御式访问。
   */
  private extractAccessToken(req: any): string | null {
    const cookieToken = req?.cookies?.access_token;
    if (typeof cookieToken === 'string' && cookieToken.trim()) {
      return cookieToken.trim();
    }

    const authHeader: unknown = req?.headers?.authorization ?? req?.headers?.Authorization;
    if (typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) return match[1]!.trim();
    }

    return null;
  }
}
