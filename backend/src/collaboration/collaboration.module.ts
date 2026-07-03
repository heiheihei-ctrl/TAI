import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';

@Module({
  imports: [PrismaModule, TeamsModule, UsersModule, JwtModule.register({})],
  providers: [CollaborationGateway, CollaborationService],
})
export class CollaborationModule {}
