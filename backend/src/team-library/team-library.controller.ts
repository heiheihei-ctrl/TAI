import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { TeamLibraryService } from './team-library.service';
import { CreateTeamAssetDto } from './dto/create-team-asset.dto';
import { CreateTeamAssetFolderDto } from './dto/create-team-asset-folder.dto';

@ApiTags('team-library')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/library')
export class TeamLibraryController {
  constructor(private readonly teamLibrary: TeamLibraryService) {}

  @Get('assets')
  listAssets(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Query('folderId') folderId?: string,
  ) {
    const resolved =
      folderId === undefined ? undefined : folderId === '' || folderId === 'root' ? null : folderId;
    return this.teamLibrary.listAssets(teamId, req.user.sub, resolved);
  }

  @Post('assets')
  createAsset(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamAssetDto,
  ) {
    return this.teamLibrary.createAsset(teamId, req.user.sub, dto);
  }

  @Delete('assets/:assetId')
  deleteAsset(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.teamLibrary.deleteAsset(teamId, assetId, req.user.sub);
  }

  @Get('folders')
  listFolders(@Req() req: any, @Param('teamId') teamId: string) {
    return this.teamLibrary.listFolders(teamId, req.user.sub);
  }

  @Post('folders')
  createFolder(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamAssetFolderDto,
  ) {
    return this.teamLibrary.createFolder(teamId, req.user.sub, dto);
  }

  @Delete('folders/:folderId')
  deleteFolder(
    @Req() req: any,
    @Param('teamId') teamId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.teamLibrary.deleteFolder(teamId, folderId, req.user.sub);
  }
}
