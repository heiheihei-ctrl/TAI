import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CsDeskService } from './cs-desk.service';
import { CsDeskController } from './cs-desk.controller';
import { CsDeskAdminController } from './cs-desk-admin.controller';
import { CsWsGateway } from './cs-ws.gateway';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret',
      }),
    }),
  ],
  controllers: [CsDeskController, CsDeskAdminController],
  providers: [CsDeskService, CsWsGateway],
  exports: [CsDeskService, CsWsGateway],
})
export class CsDeskModule {}
