import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectsSchedulerService } from './projects-scheduler.service';
import { OssModule } from '../oss/oss.module';
import { TeamCoreModule } from '../team-core/team-core.module';

@Module({
  imports: [OssModule, TeamCoreModule],
  providers: [ProjectsService, ProjectsSchedulerService],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
