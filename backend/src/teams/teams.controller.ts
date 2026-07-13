import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { TeamsService } from './teams.service';
import { TeamCreditsService } from './team-credits.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateTeamInviteDto } from './dto/create-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  CreateTeamCreditsTopupOrderDto,
  CreateTeamSeatPackageOrderDto,
} from './dto/team-payment.dto';
import { UpdateMemberQuotaDto } from './dto/update-member-quota.dto';

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly teamCredits: TeamCreditsService,
  ) {}

  private userId(req: any): string {
    return req.user?.sub ?? req.user?.id;
  }

  @Get()
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  list(@Req() req: any) {
    return this.teams.listMyTeams(this.userId(req));
  }

  @Post()
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() dto: CreateTeamDto) {
    return this.teams.createTeam(this.userId(req), dto.name);
  }

  @Get('invites/:code')
  getInviteInfo(@Param('code') code: string) {
    return this.teams.getInviteInfo(code);
  }

  @Post('invites/:code/accept')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  acceptInvite(@Req() req: any, @Param('code') code: string) {
    return this.teams.acceptInvite(this.userId(req), code);
  }

  @Get(':teamId/members')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  listMembers(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teams.listMembers(teamId, this.userId(req));
  }

  @Get(':teamId/me/quota')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  getMyQuota(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teams.getMyQuota(teamId, this.userId(req));
  }

  @Post(':teamId/invites')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  createInvite(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamInviteDto,
  ) {
    return this.teams.createInvite(teamId, this.userId(req), dto.expiresInDays ?? 7);
  }

  @Delete(':teamId/members/:userId')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  removeMember(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.teams.removeMember(teamId, this.userId(req), targetUserId);
  }

  @Patch(':teamId/members/:userId/role')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  updateMemberRole(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teams.updateMemberRole(
      teamId,
      this.userId(req),
      targetUserId,
      dto.role,
    );
  }

  @Patch(':teamId/members/:userId/quota')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  updateMemberQuota(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberQuotaDto,
  ) {
    return this.teams.updateMemberQuota(teamId, this.userId(req), targetUserId, {
      monthly: dto.monthly,
      total: dto.total,
    });
  }

  @Delete(':teamId')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  dissolveTeam(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teams.dissolveTeam(teamId, this.userId(req));
  }

  @Get(':teamId/credits/account')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  getCreditAccount(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teamCredits.getAccount(teamId, this.userId(req));
  }

  @Get(':teamId/credits/ledger')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  getCreditLedger(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.teamCredits.getLedger(
      teamId,
      this.userId(req),
      take ? Number(take) : 30,
      skip ? Number(skip) : 0,
    );
  }

  @Post(':teamId/credits/topup/orders')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  createTopupOrder(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamCreditsTopupOrderDto,
  ) {
    return this.teamCredits.createTopupOrder(teamId, this.userId(req), dto);
  }

  @Get(':teamId/seat-packages')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  listSeatPackages(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teamCredits.listSeatPackages(teamId, this.userId(req));
  }

  @Post(':teamId/seat-packages/orders')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  createSeatPackageOrder(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamSeatPackageOrderDto,
  ) {
    return this.teamCredits.createSeatPackageOrder(teamId, this.userId(req), dto);
  }
}
