import { Module } from '@nestjs/common';
import { PROVIDER_ADAPTERS } from '../../common/constants/injection-tokens';
import { DummyModule } from '../../providers-adapters/dummy/dummy.module';
import { DummyAdapter } from '../../providers-adapters/dummy/dummy.adapter';
import { VolcengineModule } from '../../providers-adapters/volcengine/volcengine.module';
import { VolcengineAdapter } from '../../providers-adapters/volcengine/volcengine.adapter';
import { ApimartModule } from '../../providers-adapters/apimart/apimart.module';
import { ApimartAdapter } from '../../providers-adapters/apimart/apimart.adapter';
import { OpenaiModule } from '../../providers-adapters/openai/openai.module';
import { OpenaiAdapter } from '../../providers-adapters/openai/openai.adapter';
import { TencentVodModule } from '../../providers-adapters/tencent-vod/tencent-vod.module';
import { TencentVodAdapter } from '../../providers-adapters/tencent-vod/tencent-vod.adapter';
import { RoutingService } from './routing.service';

@Module({
  imports: [DummyModule, VolcengineModule, ApimartModule, OpenaiModule, TencentVodModule],
  providers: [
    RoutingService,
    {
      provide: PROVIDER_ADAPTERS,
      inject: [DummyAdapter, VolcengineAdapter, ApimartAdapter, OpenaiAdapter, TencentVodAdapter],
      useFactory: (
        dummy: DummyAdapter,
        volcengine: VolcengineAdapter,
        apimart: ApimartAdapter,
        openai: OpenaiAdapter,
        tencentVod: TencentVodAdapter,
      ) => [dummy, volcengine, apimart, openai, tencentVod],
    },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
