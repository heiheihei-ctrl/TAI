import { Controller, Get, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('internal/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get(':taskId')
  async getOne(@Param('taskId') taskId: string) {
    return {
      success: true,
      data: await this.tasksService.findByInternalTaskId(taskId),
    };
  }
}
