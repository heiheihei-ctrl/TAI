import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { toPrismaJson } from '../../common/utils/prisma-json.util';
import { ChannelsService } from '../channels/channels.service';
import { ModelsService } from '../models/models.service';
import { ProvidersService } from '../providers/providers.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateModelMappingDto } from './dto/create-model-mapping.dto';
import { CreateModelDto } from './dto/create-model.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { CreateTokenDto } from './dto/create-token.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly channelsService: ChannelsService,
    private readonly modelsService: ModelsService,
    private readonly authService: AuthService,
  ) {}

  listProviders() {
    return this.providersService.list();
  }

  createProvider(dto: CreateProviderDto) {
    return this.providersService.create({
      ...dto,
      metadata: toPrismaJson(dto.metadata),
    });
  }

  listChannels() {
    return this.channelsService.list();
  }

  createChannel(dto: CreateChannelDto) {
    return this.channelsService.create({
      ...dto,
      credentialsJson: toPrismaJson(dto.credentialsJson),
      metadata: toPrismaJson(dto.metadata),
    });
  }

  listModels() {
    return this.modelsService.list();
  }

  createModel(dto: CreateModelDto) {
    return this.modelsService.create({
      ...dto,
      metadata: toPrismaJson(dto.metadata),
    });
  }

  listModelMappings() {
    return this.modelsService.listMappings();
  }

  createModelMapping(dto: CreateModelMappingDto) {
    return this.modelsService.createMapping({
      ...dto,
      configJson: toPrismaJson(dto.configJson),
    });
  }

  setModelMappingEnabled(id: string, enabled: boolean) {
    return this.modelsService.setMappingEnabled(id, enabled);
  }

  issueToken(dto: CreateTokenDto) {
    return this.authService.issueToken(dto.name, dto.scopes);
  }
}
