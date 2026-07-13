import type { ProjectContentSnapshot } from '@/types/project';
import type { CommentThreadSnapshot } from '@/types/comment';
import { paperSaveService } from '@/services/paperSaveService';
import { useProjectContentStore } from '@/stores/projectContentStore';
import { useLayerStore } from '@/stores/layerStore';
import { projectApi } from '@/services/projectApi';
import { setProjectCache } from '@/services/projectCacheStore';
import { collaborationSocket } from '@/services/collaborationSocket';

const CONTENT_BROADCAST_MIN_MS = 1200;
const COMMENTS_BROADCAST_DEBOUNCE_MS = 300;
const MAX_INLINE_PAPER_JSON = 512 * 1024;
const lastContentEmitAt = { value: 0 };
let commentsEmitTimer: ReturnType<typeof setTimeout> | null = null;
let commentsBroadcastSeq = 0;

let applyingRemote = false;
let lastAppliedSeq = 0;
let lastAppliedHash = '';

export function isApplyingRemoteContent(): boolean {
  return applyingRemote;
}

export function computeContentHash(content: ProjectContentSnapshot | null | undefined): string {
  const paperJson = typeof content?.paperJson === 'string' ? content.paperJson : '';
  const updatedAt = content?.updatedAt ?? '';
  const layerCount = content?.layers?.length ?? 0;
  if (!paperJson) return `${updatedAt}:${layerCount}:empty`;
  const head = paperJson.slice(0, 64);
  const tail = paperJson.slice(-64);
  return `${paperJson.length}:${updatedAt}:${layerCount}:${head}:${tail}`;
}

async function deserializeWhenReady(paperJson: string): Promise<boolean> {
  const attempt = () => paperSaveService.deserializePaperProject(paperJson);
  if (attempt()) return true;

  return new Promise<boolean>((resolve) => {
    const handler = () => {
      if (attempt()) {
        window.removeEventListener('paper-ready', handler as EventListener);
        resolve(true);
      }
    };
    window.addEventListener('paper-ready', handler as EventListener);
    window.setTimeout(() => {
      window.removeEventListener('paper-ready', handler as EventListener);
      resolve(attempt());
    }, 500);
  });
}

export async function applyRemoteContentUpdate(payload: {
  seq: number;
  contentHash: string;
  updatedAt: string;
  paperJson?: string;
  layers?: unknown[];
  activeLayerId?: string | null;
  assets?: unknown;
  comments?: CommentThreadSnapshot[];
  userId?: string;
}): Promise<boolean> {
  const store = useProjectContentStore.getState();
  const projectId = store.projectId;
  if (!projectId) return false;

  if (payload.comments !== undefined && !payload.paperJson) {
    applyingRemote = true;
    try {
      const nextContent: ProjectContentSnapshot = {
        ...(store.content ?? ({} as ProjectContentSnapshot)),
        comments: payload.comments,
        updatedAt: payload.updatedAt,
      };
      if (store.hydrated) {
        store.hydrate(nextContent, store.version, payload.updatedAt);
      } else {
        store.updatePartial(
          { comments: payload.comments, updatedAt: payload.updatedAt },
          { markDirty: false },
        );
      }
      lastAppliedSeq = payload.seq;
      lastAppliedHash = payload.contentHash;
      return true;
    } finally {
      applyingRemote = false;
    }
  }

  if (!store.hydrated) return false;

  if (payload.contentHash === lastAppliedHash && payload.seq <= lastAppliedSeq) {
    return false;
  }

  applyingRemote = true;
  try {
    let nextContent = store.content;
    let nextVersion = store.version;

    if (payload.paperJson) {
      nextContent = {
        ...(store.content ?? { updatedAt: payload.updatedAt } as ProjectContentSnapshot),
        paperJson: payload.paperJson,
        updatedAt: payload.updatedAt,
        meta: {
          ...(store.content?.meta ?? {}),
          paperJsonLen: payload.paperJson.length,
        },
        layers: (payload.layers as ProjectContentSnapshot['layers']) ?? store.content?.layers ?? [],
        activeLayerId:
          payload.activeLayerId !== undefined
            ? payload.activeLayerId
            : store.content?.activeLayerId ?? null,
        assets: (payload.assets as ProjectContentSnapshot['assets']) ?? store.content?.assets,
      };
    } else {
      const remote = await projectApi.getContent(projectId);
      nextContent = remote.content;
      nextVersion = remote.version;
    }

    if (!nextContent?.paperJson) return false;

    const hash = computeContentHash(nextContent);
    if (hash === computeContentHash(store.content) && store.dirty) {
      return false;
    }

    store.hydrate(nextContent, nextVersion, payload.updatedAt);
    const ok = await deserializeWhenReady(nextContent.paperJson);
    if (!ok) return false;

    try {
      useLayerStore.getState().hydrateFromContent(
        nextContent.layers ?? [],
        nextContent.activeLayerId ?? null,
      );
    } catch {
      // ignore
    }

    try {
      (window as any).tanvaPaperRestored = true;
      window.dispatchEvent(new CustomEvent('paper-project-changed'));
    } catch {
      // ignore
    }

    lastAppliedSeq = payload.seq;
    lastAppliedHash = hash;

    void setProjectCache({
      projectId,
      content: nextContent,
      version: nextVersion,
      updatedAt: payload.updatedAt,
      cachedAt: new Date().toISOString(),
    }).catch(() => {});

    return true;
  } catch (error) {
    console.warn('[collaboration] apply remote content failed:', error);
    return false;
  } finally {
    applyingRemote = false;
  }
}

export function resetCollaborationContentState() {
  lastAppliedSeq = 0;
  lastAppliedHash = '';
  applyingRemote = false;
  commentsBroadcastSeq = 0;
  lastContentEmitAt.value = 0;
  if (commentsEmitTimer) {
    clearTimeout(commentsEmitTimer);
    commentsEmitTimer = null;
  }
}

function canBroadcastContent(projectId: string): boolean {
  return collaborationSocket.isReadyForProject(projectId);
}

export function broadcastCollaborationCommentsUpdate() {
  const projectId = useProjectContentStore.getState().projectId;
  const content = useProjectContentStore.getState().content;
  if (!projectId || !content || !canBroadcastContent(projectId)) return;
  if (isApplyingRemoteContent()) return;

  if (commentsEmitTimer) clearTimeout(commentsEmitTimer);
  commentsEmitTimer = setTimeout(() => {
    commentsEmitTimer = null;
    const latest = useProjectContentStore.getState().content;
    if (!latest || !projectId || !canBroadcastContent(projectId)) return;

    commentsBroadcastSeq += 1;
    const seq = Math.max(
      commentsBroadcastSeq,
      useProjectContentStore.getState().dirtyCounter,
      1,
    );

    collaborationSocket.emitContentUpdate(projectId, {
      seq,
      contentHash: `comments:${latest.updatedAt ?? ''}:${latest.comments?.length ?? 0}:${seq}`,
      updatedAt: latest.updatedAt ?? new Date().toISOString(),
      comments: latest.comments ?? [],
    });
  }, COMMENTS_BROADCAST_DEBOUNCE_MS);
}

export function broadcastCollaborationContentUpdate(reason?: string) {
  const projectId = useProjectContentStore.getState().projectId;
  const content = useProjectContentStore.getState().content;
  const dirtyCounter = useProjectContentStore.getState().dirtyCounter;
  if (!projectId || !content || !canBroadcastContent(projectId)) return;
  if (isApplyingRemoteContent()) return;

  const now = Date.now();
  if (now - lastContentEmitAt.value < CONTENT_BROADCAST_MIN_MS) return;
  lastContentEmitAt.value = now;

  const paperJson =
    typeof content.paperJson === 'string' &&
    content.paperJson.length > 0 &&
    content.paperJson.length <= MAX_INLINE_PAPER_JSON
      ? content.paperJson
      : undefined;

  collaborationSocket.emitContentUpdate(projectId, {
    seq: dirtyCounter,
    contentHash: computeContentHash(content),
    updatedAt: content.updatedAt ?? new Date().toISOString(),
    paperJson,
    layers: content.layers,
    activeLayerId: content.activeLayerId,
    assets: content.assets,
  });

  if (import.meta.env.DEV && reason) {
    console.debug('[collaboration] content broadcast:', reason);
  }
}
