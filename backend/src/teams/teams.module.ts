import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamCreditsService } from './team-credits.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamCreditsService],
  exports: [TeamsService],
})
export class TeamsModule {}
