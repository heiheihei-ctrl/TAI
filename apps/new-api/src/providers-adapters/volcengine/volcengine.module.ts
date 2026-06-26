import { Module } from '@nestjs/common';
import { VolcengineAdapter } from './volcengine.adapter';

@Module({
  providers: [VolcengineAdapter],
  exports: [VolcengineAdapter],
})
export class VolcengineModule {}
