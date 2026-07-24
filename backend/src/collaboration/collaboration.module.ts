import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamCoreModule } from '../team-core/team-core.module';
import { UsersModule } from '../users/users.module';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';

@Module({
  imports: [PrismaModule, TeamCoreModule, UsersModule, JwtModule.register({})],
  providers: [CollaborationGateway, CollaborationService],
})
export class CollaborationModule {}
