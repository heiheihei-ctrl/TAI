import { Controller, Get } from '@nestjs/common';
import { ChannelsService } from './channels.service';

@Controller('registry/channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.channelsService.list(),
    };
  }
}
