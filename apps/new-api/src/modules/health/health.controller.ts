import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/auth.util';
import { HealthService } from './health.service';

@Controller('api/status')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getStatus() {
    return this.healthService.getStatus();
  }
}
