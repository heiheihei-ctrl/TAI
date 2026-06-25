import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import appConfig from './common/config/app.config';
import { validateEnvironment } from './common/config/env.validation';
import { BearerTokenGuard } from './common/auth/bearer-token.guard';
import { AppExceptionFilter } from './common/errors/exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RedisModule } from './common/utils/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { ModelsModule } from './modules/models/models.module';
import { RoutingModule } from './modules/routing/routing.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { VideoModule } from './gateways/video/video.module';
import { ImageModule } from './gateways/image/image.module';
import { ChatModule } from './gateways/chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [appConfig],
      validate: validateEnvironment,
    }),
    RedisModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    ProvidersModule,
    ChannelsModule,
    ModelsModule,
    RoutingModule,
    TasksModule,
    HealthModule,
    AdminModule,
    VideoModule,
    ImageModule,
    ChatModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: BearerTokenGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
  ],
})
export class AppModule {}
