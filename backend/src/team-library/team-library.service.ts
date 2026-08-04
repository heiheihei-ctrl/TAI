import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamCoreService } from '../team-core/team-core.service';
import { CreateTeamAssetDto } from './dto/create-team-asset.dto';
import { CreateTeamAssetFolderDto } from './dto/create-team-asset-folder.dto';

const MAX_TEAM_ASSETS = 2000;
const MAX_TEAM_FOLDERS = 200;

@Injectable()
export class TeamLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamCore: TeamCoreService,
  ) {}

  private async assertEnterpriseTeam(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('企业不存在');
    if (team.isPersonal) throw new ForbiddenException('个人工作区不支持企业素材库');
    if (team.status !== 'active') throw new ForbiddenException('企业已停用');
    return team;
  }

  async listAssets(teamId: string, userId: string, folderId?: string | null) {
    await this.teamCore.assertMember(teamId, userId);
    await this.assertEnterpriseTeam(teamId);

    return this.prisma.teamAsset.findMany({
      where: {
        teamId,
        ...(folderId === undefined
          ? {}
          : folderId === null || folderId === ''
            ? { folderId: null }
            : { folderId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, name: true, avatarUrl: true } },
        folder: { select: { id: true, name: true } },
      },
      take: 500,
    });
  }

  async createAsset(teamId: string, userId: string, dto: CreateTeamAssetDto) {
    await this.teamCore.assertMember(teamId, userId);
    await this.assertEnterpriseTeam(teamId);

    const count = await this.prisma.teamAsset.count({ where: { teamId } });
    if (count >= MAX_TEAM_ASSETS) {
      throw new BadRequestException(`企业素材库已达上限（${MAX_TEAM_ASSETS}）`);
    }

    if (dto.folderId) {
      const folder = await this.prisma.teamAssetFolder.findFirst({
        where: { id: dto.folderId, teamId },
      });
      if (!folder) throw new BadRequestException('文件夹不存在');
    }

    const url = dto.url.trim();
    if (
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      /^[A-Za-z0-9+/=]{100,}$/.test(url)
    ) {
      throw new BadRequestException('素材必须使用远程 URL，禁止 data/blob/base64');
    }

    return this.prisma.teamAsset.create({
      data: {
        teamId,
        uploaderId: userId,
        folderId: dto.folderId || null,
        name: dto.name.trim(),
        url,
        ossKey: dto.ossKey?.trim() || null,
        mime: dto.mime?.trim() || null,
        size: dto.size ?? null,
        thumbnail: dto.thumbnail?.trim() || null,
        assetType: dto.assetType || '2d',
        metadata: (dto.metadata as any) ?? undefined,
      },
      include: {
        uploader: { select: { id: true, name: true, avatarUrl: true } },
        folder: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAsset(teamId: string, assetId: string, userId: string) {
    const membership = await this.teamCore.assertMember(teamId, userId);
    await this.assertEnterpriseTeam(teamId);

    const asset = await this.prisma.teamAsset.findFirst({
      where: { id: assetId, teamId },
    });
    if (!asset) throw new NotFoundException('素材不存在');

    const canDeleteAny = membership.role === 'owner' || membership.role === 'admin';
    if (!canDeleteAny && asset.uploaderId !== userId) {
      throw new ForbiddenException('只能删除自己上传的素材');
    }

    await this.prisma.teamAsset.delete({ where: { id: assetId } });
    return { ok: true };
  }

  async listFolders(teamId: string, userId: string) {
    await this.teamCore.assertMember(teamId, userId);
    await this.assertEnterpriseTeam(teamId);
    return this.prisma.teamAssetFolder.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
  }

  async createFolder(teamId: string, userId: string, dto: CreateTeamAssetFolderDto) {
    await this.teamCore.assertRole(teamId, userId, ['owner', 'admin', 'member']);
    await this.assertEnterpriseTeam(teamId);

    const count = await this.prisma.teamAssetFolder.count({ where: { teamId } });
    if (count >= MAX_TEAM_FOLDERS) {
      throw new BadRequestException(`文件夹数量已达上限（${MAX_TEAM_FOLDERS}）`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.teamAssetFolder.findFirst({
        where: { id: dto.parentId, teamId },
      });
      if (!parent) throw new BadRequestException('父文件夹不存在');
    }

    return this.prisma.teamAssetFolder.create({
      data: {
        teamId,
        name: dto.name.trim(),
        parentId: dto.parentId || null,
      },
    });
  }

  async deleteFolder(teamId: string, folderId: string, userId: string) {
    await this.teamCore.assertRole(teamId, userId, ['owner', 'admin']);
    await this.assertEnterpriseTeam(teamId);

    const folder = await this.prisma.teamAssetFolder.findFirst({
      where: { id: folderId, teamId },
    });
    if (!folder) throw new NotFoundException('文件夹不存在');

    await this.prisma.$transaction(async (tx) => {
      await tx.teamAsset.updateMany({
        where: { teamId, folderId },
        data: { folderId: null },
      });
      await tx.teamAssetFolder.delete({ where: { id: folderId } });
    });

    return { ok: true };
  }
}
