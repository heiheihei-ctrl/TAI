import { Module } from '@nestjs/common';
import { ApimartAdapter } from './apimart.adapter';

@Module({
  providers: [ApimartAdapter],
  exports: [ApimartAdapter],
})
export class ApimartModule {}
