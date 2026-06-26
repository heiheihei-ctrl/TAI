import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus, TaskType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { normalizeTaskStatus } from './task-status.util';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
  ) {}

  async createQueuedTask(input: {
    taskType: TaskType;
    modelKey: string;
    requestPayloadJson: Prisma.InputJsonValue;
    callbackUrl?: string;
  }) {
    const internalTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.task.create({
      data: {
        internalTaskId,
        taskType: input.taskType,
        modelKey: input.modelKey,
        requestPayloadJson: input.requestPayloadJson,
        callbackUrl: input.callbackUrl,
        status: TaskStatus.queued,
      },
    });
  }

  async markSubmitted(
    taskId: string,
    input: {
      providerKey: string;
      channelKey: string;
      upstreamTaskId: string;
      upstreamStatus?: string;
      upstreamResponseJson?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        providerKey: input.providerKey,
        channelKey: input.channelKey,
        upstreamTaskId: input.upstreamTaskId,
        upstreamStatus: input.upstreamStatus,
        upstreamResponseJson: input.upstreamResponseJson,
        status: normalizeTaskStatus(input.upstreamStatus ?? 'queued'),
      },
    });
  }

  async markTerminal(
    taskId: string,
    input: {
      status: TaskStatus;
      upstreamStatus?: string;
      normalizedResponseJson?: Prisma.InputJsonValue;
      upstreamResponseJson?: Prisma.InputJsonValue;
      errorMessage?: string | null;
    },
  ) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: input.status,
        upstreamStatus: input.upstreamStatus,
        normalizedResponseJson: input.normalizedResponseJson,
        upstreamResponseJson: input.upstreamResponseJson,
        errorMessage: input.errorMessage,
        finishedAt: input.status === TaskStatus.succeeded || input.status === TaskStatus.failed ? new Date() : null,
      },
    });
  }

  async findByInternalTaskId(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { internalTaskId: taskId },
    });
    if (!task) {
      throw new AppException('TASK_NOT_FOUND', `Task ${taskId} does not exist`, 404);
    }
    return task;
  }

  async refreshVideoTask(taskId: string) {
    const task = await this.findByInternalTaskId(taskId);
    if (task.taskType !== TaskType.video) {
      throw new AppException('TASK_TYPE_MISMATCH', 'Task is not a video task', 400);
    }
    if (task.status === TaskStatus.succeeded || task.status === TaskStatus.failed) {
      return task;
    }
    if (!task.upstreamTaskId) {
      return task;
    }

    const route = await this.routingService.resolveRoute(task.modelKey, TaskType.video);
    const adapter = this.routingService.getAdapter(route.providerKey);
    const queried = await adapter.queryVideoTask(route, task.upstreamTaskId);
    const status = normalizeTaskStatus(queried.upstreamStatus ?? queried.status);

    const updated = await this.prisma.task.update({
      where: { internalTaskId: taskId },
      data: {
        status,
        upstreamStatus: queried.upstreamStatus,
        normalizedResponseJson: queried.result as Prisma.InputJsonValue | undefined,
        upstreamResponseJson: queried.response as Prisma.InputJsonValue | undefined,
        errorMessage: queried.errorMessage,
        finishedAt:
          status === TaskStatus.succeeded || status === TaskStatus.failed ? new Date() : null,
      },
    });

    return updated;
  }
}
