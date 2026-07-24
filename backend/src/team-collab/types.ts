export type CollabEventType =
  | 'cursor'
  | 'node_patch'
  | 'canvas_patch'
  | 'node_lock'
  | 'task_status'
  | 'toast'
  | 'presence_join'
  | 'presence_leave'
  | 'access_revoked'
  | 'comment_changed'
  | 'team_projects_changed'
  | 'comment_marker_move'
  | 'team_credits_changed'
  | 'user_credits_changed';

export interface CollabEnvelope<T = unknown> {
  type: CollabEventType;
  payload: T;
  ts: number;
  senderConnId?: string;
  senderUserId?: string;
  seq?: number;
}

export interface CursorPayload {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  color?: string;
  x: number;
  y: number;
  viewport?: { zoom?: number; offsetX?: number; offsetY?: number };
}

export interface PresenceUserPayload {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  color?: string;
}

export interface NodePatchPayload {
  upsertNodes?: unknown[];
  removeNodeIds?: string[];
  upsertEdges?: unknown[];
  removeEdgeIds?: string[];
}

export interface CanvasPatchPayload {
  upsertImages?: unknown[];
  removeImageIds?: string[];
  upsertPaths?: unknown[];
  removePathIds?: string[];
}

export type NodeLockAction = 'claim' | 'release' | 'expired' | 'renewed';

export interface NodeLockPayload {
  nodeId: string;
  action: NodeLockAction;
  userId: string;
  expiresAt: number;
}

export type TaskBroadcastStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface TaskStatusPayload {
  taskId: string;
  nodeId?: string | null;
  taskType: string;
  category: 'image' | 'video';
  status: TaskBroadcastStatus;
  progress?: number;
  resultPreview?: { url?: string; thumbnailUrl?: string } | null;
  error?: string | null;
}

export type ToastKind = 'upload' | 'generate' | 'delete' | 'share' | 'info';

export interface ToastPayload {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  kind: ToastKind;
  text: string;
}

export interface AccessRevokedPayload {
  reason?: string;
}

export type CommentChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'resolved'
  | 'reopened'
  | 'moved';

export interface CommentChangedPayload {
  action: CommentChangeAction;
  nodeId?: string | null;
  threadId: string;
  commentId?: string;
}

export type TeamProjectsChangeAction =
  | 'created'
  | 'deleted'
  | 'renamed'
  | 'shared'
  | 'unshared';

export interface TeamProjectsChangedPayload {
  teamId: string;
  action: TeamProjectsChangeAction;
  projectId: string;
  actorUserId?: string | null;
}

export interface CommentMarkerMovePayload {
  threadId: string;
  x: number;
  y: number;
}

export type TeamCreditsChangeReason =
  | 'reserve'
  | 'deduct'
  | 'release'
  | 'topup'
  | 'admin_adjust'
  | 'subscription_grant';

export interface TeamCreditsChangedPayload {
  teamId: string;
  delta: number;
  availableCredits: number;
  balance: number;
  frozenBalance: number;
  reason: TeamCreditsChangeReason;
  actorUserId?: string | null;
  taskId?: string | null;
}

export interface UserCreditsChangedPayload {
  userId: string;
  delta: number;
  balance: number;
  reason: string;
}

export const PERSISTED_EVENT_TYPES: ReadonlySet<CollabEventType> = new Set([
  'node_patch',
  'canvas_patch',
  'task_status',
]);

export function isPersistedEvent(type: CollabEventType): boolean {
  return PERSISTED_EVENT_TYPES.has(type);
}