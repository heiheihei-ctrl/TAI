import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Scopes } from '../../common/auth/auth.util';
import { AdminService } from './admin.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateModelMappingDto } from './dto/create-model-mapping.dto';
import { CreateModelDto } from './dto/create-model.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { UpdateMappingEnabledDto } from './dto/update-mapping-enabled.dto';

@Scopes('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('providers')
  async listProviders() {
    return { success: true, data: await this.adminService.listProviders() };
  }

  @Post('providers')
  async createProvider(@Body() dto: CreateProviderDto) {
    return { success: true, data: await this.adminService.createProvider(dto) };
  }

  @Get('channels')
  async listChannels() {
    return { success: true, data: await this.adminService.listChannels() };
  }

  @Post('channels')
  async createChannel(@Body() dto: CreateChannelDto) {
    return { success: true, data: await this.adminService.createChannel(dto) };
  }

  @Get('models')
  async listModels() {
    return { success: true, data: await this.adminService.listModels() };
  }

  @Post('models')
  async createModel(@Body() dto: CreateModelDto) {
    return { success: true, data: await this.adminService.createModel(dto) };
  }

  @Get('model-mappings')
  async listMappings() {
    return { success: true, data: await this.adminService.listModelMappings() };
  }

  @Post('model-mappings')
  async createMapping(@Body() dto: CreateModelMappingDto) {
    return { success: true, data: await this.adminService.createModelMapping(dto) };
  }

  @Patch('model-mappings/:id/enabled')
  async updateMappingEnabled(
    @Param('id') id: string,
    @Body() dto: UpdateMappingEnabledDto,
  ) {
    return {
      success: true,
      data: await this.adminService.setModelMappingEnabled(id, dto.enabled),
    };
  }

  @Post('tokens')
  async issueToken(@Body() dto: CreateTokenDto) {
    return { success: true, data: await this.adminService.issueToken(dto) };
  }
}
