import { Controller, Get } from '@nestjs/common';
import { ModelsService } from './models.service';

@Controller('registry/models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.modelsService.list(),
    };
  }
}
