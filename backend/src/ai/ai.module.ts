import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { ImageGenerationService } from './image-generation.service';
import { BackgroundRemovalService } from './services/background-removal.service';
import { AiController } from './ai.controller';
import { ArchitectureController } from './architecture.controller';
import { WorkflowAgentController } from './workflow-agent/workflow-agent.controller';
import { WorkflowAgentService } from './workflow-agent/workflow-agent.service';
import { GeminiProProvider } from './providers/gemini-pro.provider';
import { BananaProvider } from './providers/banana.provider';
import { RunningHubProvider } from './providers/runninghub.provider';
import { MidjourneyProvider } from './providers/midjourney.provider';
import { Nano2Provider } from './providers/nano2.provider';
import { Seedream5Provider } from './providers/seedream5.provider';
import { Seedream5ProProvider } from './providers/seedream5-pro.provider';
import { AIProviderFactory } from './ai-provider.factory';
import { CostCalculatorService } from './services/cost-calculator.service';
import { Convert2Dto3DService } from './services/convert-2d-to-3d.service';
import { ExpandImageService } from './services/expand-image.service';
import { Sora2VideoService } from './services/sora2-video.service';
import { VeoVideoService } from './services/veo-video.service';
import { VideoProviderService } from './services/video-provider.service';
import { ImageTaskService } from './services/image-task.service';
import { ApiKeyOrJwtGuard } from '../auth/guards/api-key-or-jwt.guard';
import { UsersModule } from '../users/users.module';
import { CreditsModule } from '../credits/credits.module';
import { OssModule } from '../oss/oss.module';
import { VideoWatermarkService } from './services/video-watermark.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Nano2Service } from './services/nano2.service';
import { Seedream5Service } from './services/seedream5.service';
import { MinimaxSpeechService } from './services/minimax-speech.service';
import { MinimaxMusicService } from './services/minimax-music.service';
import { TencentSpeechService } from './services/tencent-speech.service';
import { TencentAsrAuthService } from './services/tencent-asr-auth.service';
import { TencentVodAigcService } from './services/tencent-vod-aigc.service';
import { ModelRoutingService } from './services/model-routing.service';
import { UpstreamImageUrlService } from './services/upstream-image-url.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { VolcAssetModule } from '../volc-asset/volc-asset.module';
import { ContentModerationModule } from '../content-moderation/content-moderation.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    CreditsModule,
    OssModule,
    PrismaModule,
    TelemetryModule,
    VolcAssetModule,
    ContentModerationModule,
  ],
  providers: [
    AiService,
    ImageGenerationService,
    BackgroundRemovalService,
    GeminiProProvider,
    BananaProvider,
    RunningHubProvider,
    MidjourneyProvider,
    Nano2Provider,
    Seedream5Provider,
    Seedream5ProProvider,
    AIProviderFactory,
    CostCalculatorService, // 添加成本计算器
    Convert2Dto3DService, // 添加2D转3D服务
    ExpandImageService, // 添加扩图服务
    Sora2VideoService,
    VeoVideoService, // 添加 VEO 视频服务
    VideoProviderService,
    VideoWatermarkService,
    Nano2Service,
    Seedream5Service,
    MinimaxSpeechService,
    MinimaxMusicService,
    TencentSpeechService,
    TencentAsrAuthService,
    TencentVodAigcService,
    ModelRoutingService,
    UpstreamImageUrlService,
    ImageTaskService, // 添加图像任务服务
    WorkflowAgentService,
    ApiKeyOrJwtGuard,
  ],
  // ArchitectureController = 建筑设计 AI（tgagent）BFF 转发，路由 /api/ai/architecture-chat。
  // WorkflowAgentController = 对话驱动 Flow 生图工作流（DeepSeek 规划，前端建节点 Run）。
  // 与巨型 AiController 分开成文件，避免继续往 7200+ 行的单体里塞东西。
  controllers: [AiController, ArchitectureController, WorkflowAgentController],
  exports: [AIProviderFactory, CostCalculatorService, BackgroundRemovalService, VeoVideoService], // 导出工厂和成本计算器供其他模块使用
})
export class AiModule {}
