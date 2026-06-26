import { Controller, Get } from '@nestjs/common';
import { ProvidersService } from './providers.service';

@Controller('registry/providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.providersService.list(),
    };
  }
}
