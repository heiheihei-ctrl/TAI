import { TaskStatus } from '@prisma/client';

export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  const value = (status ?? '').toLowerCase();
  switch (value) {
    case 'queued':
    case 'pending':
    case 'created':
      return TaskStatus.queued;
    case 'processing':
    case 'running':
    case 'in_progress':
      return TaskStatus.processing;
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'done':
      return TaskStatus.succeeded;
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return TaskStatus.failed;
    default:
      return TaskStatus.processing;
  }
}
