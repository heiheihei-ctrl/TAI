import { Module } from '@nestjs/common';
import { OpenaiAdapter } from './openai.adapter';

@Module({
  providers: [OpenaiAdapter],
  exports: [OpenaiAdapter],
})
export class OpenaiModule {}
