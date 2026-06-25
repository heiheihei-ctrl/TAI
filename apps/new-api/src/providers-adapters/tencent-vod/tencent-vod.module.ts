import { Module } from '@nestjs/common';
import { TencentVodAdapter } from './tencent-vod.adapter';

@Module({
  providers: [TencentVodAdapter],
  exports: [TencentVodAdapter],
})
export class TencentVodModule {}
