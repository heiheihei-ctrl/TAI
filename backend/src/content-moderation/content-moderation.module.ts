import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AliyunGreenClient } from './aliyun-green.client';
import { ContentModerationService } from './content-moderation.service';

@Module({
  imports: [ConfigModule],
  providers: [AliyunGreenClient, ContentModerationService],
  exports: [ContentModerationService, AliyunGreenClient],
})
export class ContentModerationModule {}
