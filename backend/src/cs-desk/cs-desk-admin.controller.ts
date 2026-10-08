import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CsDeskService } from './cs-desk.service';
import {
  CreateCollabDto,
  CreateTicketDto,
  ListConversationsQueryDto,
  RecommendPackageDto,
  SendMessageDto,
} from './dto/cs-desk.dto';

type AuthUser = {
  sub?: string;
  id?: string;
  role?: string;
  name?: string;
  isCsAgent?: boolean;
};

type AuthenticatedRequest = FastifyRequest & { user: AuthUser };

class TransferDto {
  @IsString()
  @MinLength(1)
  toAgentId!: string;
}

class PresenceDto {
  @IsIn(['online', 'away', 'offline'])
  status!: 'online' | 'away' | 'offline';
}

class AdminListQueryDto extends ListConversationsQueryDto {
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}

@ApiTags('cs-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cs/admin')
export class CsDeskAdminController {
  constructor(private readonly csDesk: CsDeskService) {}

  private agentId(req: AuthenticatedRequest): string {
    return String(req.user?.sub || req.user?.id || '');
  }

  private isFullAdmin(req: AuthenticatedRequest): boolean {
    return String(req.user?.role || '').toLowerCase() === 'admin';
  }

  private async assertAgent(req: AuthenticatedRequest) {
    return this.csDesk.assertAgentUser(this.agentId(req));
  }

  @Get('conversations')
  @ApiOperation({ summary: '座席会话队列' })
  async list(
    @Request() req: AuthenticatedRequest,
    @Query() query: AdminListQueryDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.listAdmin({
      status: query.status,
      scope: query.scope,
      agentId: this.agentId(req),
      isFullAdmin: this.isFullAdmin(req),
    });
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: '座席查看会话' })
  async getOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.getConversationForAgent(id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '座席拉取消息' })
  async listMessages(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.listMessages(id, {
      userId: this.agentId(req),
      isAgent: true,
    });
  }

  @Post('conversations/:id/accept')
  @ApiOperation({ summary: '接入待接入会话' })
  async accept(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.acceptConversation(id, this.agentId(req));
  }

  @Post('conversations/:id/end')
  @ApiOperation({ summary: '结束会话' })
  async end(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.endConversation(id, this.agentId(req), {
      force: this.isFullAdmin(req),
    });
  }

  @Post('conversations/:id/transfer')
  @ApiOperation({ summary: '转接会话给其他在线客服' })
  async transfer(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: TransferDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.transferConversation(
      id,
      this.agentId(req),
      body.toAgentId,
      this.isFullAdmin(req),
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: '座席发送消息' })
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.sendAgentMessage(id, this.agentId(req), body);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: '座席标记已读' })
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.markRead(id, {
      userId: this.agentId(req),
      isAgent: true,
    });
  }

  @Post('conversations/:id/recommend-package')
  @ApiOperation({ summary: '推荐服务包卡片' })
  async recommend(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RecommendPackageDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.recommendPackage(id, this.agentId(req), body.packageId);
  }

  @Post('conversations/:id/tickets')
  @ApiOperation({ summary: '创建工单' })
  async createTicket(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateTicketDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.createTicket(
      id,
      this.agentId(req),
      body.title,
      body.note,
    );
  }

  @Get('conversations/:id/tickets')
  @ApiOperation({ summary: '会话工单列表' })
  async listTickets(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    return this.csDesk.listTickets(id);
  }

  @Post('conversations/:id/collab')
  @ApiOperation({ summary: '发起协同操作请求' })
  async createCollab(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateCollabDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.createCollabRequest(id, this.agentId(req), body);
  }

  @Get('conversations/:id/customer')
  @ApiOperation({ summary: '客户信息聚合' })
  async customer(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.assertAgent(req);
    const conv = await this.csDesk.getConversationForAgent(id);
    const [profile, history] = await Promise.all([
      this.csDesk.getCustomerProfile(conv.userId),
      this.csDesk.listServiceHistory(conv.userId),
    ]);
    return { profile, history };
  }

  @Get('quick-replies')
  @ApiOperation({ summary: '快捷回复列表' })
  async quickReplies(@Request() req: AuthenticatedRequest) {
    await this.assertAgent(req);
    return this.csDesk.listQuickReplies();
  }

  @Get('service-packages')
  @ApiOperation({ summary: '服务包目录' })
  async packages(@Request() req: AuthenticatedRequest) {
    await this.assertAgent(req);
    return this.csDesk.listServicePackages();
  }

  @Get('presence')
  @ApiOperation({ summary: '当前座席在线状态' })
  async getPresence(@Request() req: AuthenticatedRequest) {
    await this.assertAgent(req);
    return this.csDesk.getPresence(this.agentId(req));
  }

  @Patch('presence')
  @ApiOperation({ summary: '设置座席在线/暂离' })
  async setPresence(
    @Request() req: AuthenticatedRequest,
    @Body() body: PresenceDto,
  ) {
    await this.assertAgent(req);
    return this.csDesk.setPresence(this.agentId(req), body.status);
  }

  @Get('online-agents')
  @ApiOperation({ summary: '在线客服列表（转接用）' })
  async onlineAgents(@Request() req: AuthenticatedRequest) {
    await this.assertAgent(req);
    return this.csDesk.listOnlineAgents(this.agentId(req));
  }
}
