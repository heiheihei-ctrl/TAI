import { Injectable } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { toPrismaJson } from '../../common/utils/prisma-json.util';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutingService } from '../../modules/routing/routing.service';
import { TasksService } from '../../modules/tasks/tasks.service';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { VideoTaskResponse } from './types';

@Injectable()
export class VideoService {
  constructor(
    private readonly routingService: RoutingService,
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
  ) {}

  async createTask(dto: CreateVideoTaskDto): Promise<VideoTaskResponse> {
    const route = await this.routingService.resolveRoute(dto.model, TaskType.video);
    if (route.protocolType !== 'task') {
      throw new AppException(
        'MODEL_PROTOCOL_NOT_SUPPORTED',
        `Model ${dto.model} uses protocol ${route.protocolType}, video task endpoint only supports task protocol now`,
        501,
      );
    }

    const task = await this.tasksService.createQueuedTask({
      taskType: TaskType.video,
      modelKey: dto.model,
      requestPayloadJson: toPrismaJson(dto as unknown as Record<string, unknown>)!,
    });

    const adapter = this.routingService.getAdapter(route.providerKey);
    const submitted = await adapter.submitVideoTask(route, {
      prompt: dto.prompt,
      metadata: dto.metadata,
    });

    await this.tasksService.markSubmitted(task.id, {
      providerKey: route.providerKey,
      channelKey: route.channelKey,
      upstreamTaskId: submitted.upstreamTaskId,
      upstreamStatus: submitted.upstreamStatus,
      upstreamResponseJson: toPrismaJson((submitted.response ?? null) as Record<string, unknown> | null),
    });

    const latest = await this.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });

    return {
      id: latest.internalTaskId,
      task_id: latest.internalTaskId,
      status: latest.status,
    };
  }

  async getTask(taskId: string): Promise<VideoTaskResponse> {
    const task = await this.tasksService.refreshVideoTask(taskId);

    return {
      id: task.internalTaskId,
      task_id: task.internalTaskId,
      status: task.status,
      metadata:
        task.normalizedResponseJson &&
        typeof task.normalizedResponseJson === 'object' &&
        !Array.isArray(task.normalizedResponseJson)
          ? (task.normalizedResponseJson as Record<string, unknown>)
          : undefined,
      result:
        task.normalizedResponseJson &&
        typeof task.normalizedResponseJson === 'object' &&
        !Array.isArray(task.normalizedResponseJson)
          ? (task.normalizedResponseJson as Record<string, unknown>)
          : {},
      upstream_status: task.upstreamStatus,
      error: task.errorMessage,
    };
  }
}
