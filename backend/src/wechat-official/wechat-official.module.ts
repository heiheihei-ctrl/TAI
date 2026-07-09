import { Module } from '@nestjs/common';
import { WechatOfficialService } from './wechat-official.service';

@Module({
  providers: [WechatOfficialService],
  exports: [WechatOfficialService],
})
export class WechatOfficialModule {}
