/**
 * 评论已读追踪（localStorage 实现，按项目 + 用户隔离）。
 * 当用户点开某个评论线程后标记为已读，画布上的未读徽章消失。
 */

const STORAGE_KEY_PREFIX = 'comment-read:';

function buildKey(projectId: string, userId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}:${userId}`;
}

/** 获取某项目下当前用户已读的线程 ID 集合 */
export function getReadThreadIds(projectId: string, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(buildKey(projectId, userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/** 标记某线程为已读 */
export function markThreadRead(projectId: string, userId: string, threadId: string): void {
  try {
    const set = getReadThreadIds(projectId, userId);
    set.add(threadId);
    localStorage.setItem(buildKey(projectId, userId), JSON.stringify([...set]));
  } catch {}
}

/** 判断某线程是否已读 */
export function isThreadRead(projectId: string, userId: string, threadId: string): boolean {
  return getReadThreadIds(projectId, userId).has(threadId);
}
