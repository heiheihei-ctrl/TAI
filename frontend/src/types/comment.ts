export interface CommentMessageSnapshot {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  /** 回复的目标消息 id */
  replyToMessageId?: string;
  /** 回复的目标用户名（展示用） */
  replyToAuthorName?: string;
}

export interface CommentThreadSnapshot {
  id: string;
  /** 画布项目坐标 */
  x: number;
  y: number;
  resolved: boolean;
  messages: CommentMessageSnapshot[];
  createdAt: string;
}

export function createCommentId(prefix = 'comment'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCommentTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ts).toLocaleDateString();
}

export function commentAuthorInitial(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const cjk = trimmed.match(/[\u4e00-\u9fff]/);
  if (cjk) return trimmed.slice(-1);
  return trimmed.slice(0, 1).toUpperCase();
}

/** 稳定空数组，避免 Zustand selector 每次返回新 [] 触发无限更新 */
export const EMPTY_COMMENT_THREADS: CommentThreadSnapshot[] = [];
