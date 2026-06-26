import { Module } from '@nestjs/common';
import { RoutingModule } from '../../modules/routing/routing.module';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [RoutingModule, TasksModule],
  controllers: [VideoController],
  providers: [VideoService],
})
export class VideoModule {}
