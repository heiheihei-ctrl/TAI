import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectsSchedulerService } from './projects-scheduler.service';
import { OssModule } from '../oss/oss.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [OssModule, TeamsModule],
  providers: [ProjectsService, ProjectsSchedulerService],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
