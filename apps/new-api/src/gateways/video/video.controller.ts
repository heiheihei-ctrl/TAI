import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { VideoService } from './video.service';

@Controller('v1/videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post()
  createTask(@Body() dto: CreateVideoTaskDto) {
    return this.videoService.createTask(dto);
  }

  @Get(':taskId')
  getTask(@Param('taskId') taskId: string) {
    return this.videoService.getTask(taskId);
  }
}
