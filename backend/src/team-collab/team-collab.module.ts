import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamCoreModule } from '../team-core/team-core.module';
import { TeamCreditsModule } from '../team-credits/team-credits.module';
import { CollabEventBus } from './collab-event-bus.service';
import { CollabEventLog } from './collab-event-log.service';
import { NodeLockService } from './node-lock.service';
import { CanvasSseManager } from './canvas-sse.manager';
import { TeamCreditsPublisher } from './team-credits-publisher.service';
import { WsCollabGateway } from './ws-collab.gateway';
import { TeamCollabController } from './team-collab.controller';
import { TeamRealtimeController } from './team-realtime.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    TeamCoreModule,
    TeamCreditsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret',
      }),
    }),
  ],
  providers: [
    CollabEventBus,
    CollabEventLog,
    NodeLockService,
    CanvasSseManager,
    TeamCreditsPublisher,
    WsCollabGateway,
  ],
  controllers: [TeamCollabController, TeamRealtimeController],
  exports: [
    CollabEventBus,
    CollabEventLog,
    NodeLockService,
    CanvasSseManager,
    TeamCreditsPublisher,
    WsCollabGateway,
  ],
})
export class TeamCollabModule {}
