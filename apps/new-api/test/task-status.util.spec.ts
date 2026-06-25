import { TaskStatus } from '@prisma/client';
import { normalizeTaskStatus } from '../src/modules/tasks/task-status.util';

describe('normalizeTaskStatus', () => {
  it('maps upstream states into unified states', () => {
    expect(normalizeTaskStatus('pending')).toBe(TaskStatus.queued);
    expect(normalizeTaskStatus('running')).toBe(TaskStatus.processing);
    expect(normalizeTaskStatus('completed')).toBe(TaskStatus.succeeded);
    expect(normalizeTaskStatus('error')).toBe(TaskStatus.failed);
  });
});
