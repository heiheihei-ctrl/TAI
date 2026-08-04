import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamCoreModule } from '../team-core/team-core.module';
import { TeamLibraryController } from './team-library.controller';
import { TeamLibraryService } from './team-library.service';

@Module({
  imports: [PrismaModule, TeamCoreModule],
  controllers: [TeamLibraryController],
  providers: [TeamLibraryService],
  exports: [TeamLibraryService],
})
export class TeamLibraryModule {}
