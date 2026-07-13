import React from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
import { Check, CornerUpLeft, MoreHorizontal, Send, Trash2, X } from 'lucide-react';
import { useToolStore } from '@/stores/toolStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useProjectContentStore } from '@/stores/projectContentStore';
import { useAuthStore } from '@/stores/authStore';
import { useCommentStore } from '@/stores/commentStore';
import { projectToClientWithViewport, clientToProjectWithViewport } from '@/utils/paperCoords';
import {
  commentAuthorInitial,
  createCommentId,
  formatCommentTime,
  type CommentMessageSnapshot,
  type CommentThreadSnapshot,
} from '@/types/comment';
import './comment-mode.css';

type DraftState = {
  x: number;
  y: number;
};

type ScreenPoint = { left: number; top: number };

type Props = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

function resolveAuthorName(user: {
  name?: string;
  phone?: string;
  email?: string;
  id: string;
} | null): string {
  if (!user) return '访客';
  if (user.name?.trim()) return user.name.trim();
  if (user.phone?.trim()) return `用户-${user.phone.slice(-6)}`;
  if (user.email?.trim()) return user.email.split('@')[0] || user.email;
  return `用户-${user.id.slice(0, 6)}`;
}

function projectPointToScreen(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  zoom: number,
  panX: number,
  panY: number
): ScreenPoint {
  const p = projectToClientWithViewport(canvas, x, y, zoom, panX, panY);
  return { left: p.x, top: p.y };
}

function CommentMarkerPin({ name, count }: { name: string; count: number }) {
  return (
    <div className="comment-mode-marker-inner">
      <div className="comment-mode-marker-avatar">{commentAuthorInitial(name)}</div>
      {count > 0 ? (
        <span className="comment-mode-marker-badge">{count > 99 ? '99+' : count}</span>
      ) : null}
    </div>
  );
}

function commentPinTitle(count: number): string {
  if (count <= 0) return '评论';
  return `${count} 条评论`;
}

function isThreadOwner(thread: CommentThreadSnapshot, currentAuthorId: string): boolean {
  return thread.messages[0]?.authorId === currentAuthorId;
}

type CommentMarkerButtonProps = {
  canvas: HTMLCanvasElement;
  thread: CommentThreadSnapshot;
  left: number;
  top: number;
  isActive: boolean;
  currentAuthorId: string;
  zoom: number;
  panX: number;
  panY: number;
  onSelect: () => void;
  onDragPreview: (threadId: string, x: number, y: number) => void;
  onDragCommit: (threadId: string, x: number, y: number) => void;
  onDragCancel: () => void;
};

function CommentMarkerButton({
  canvas,
  thread,
  left,
  top,
  isActive,
  currentAuthorId,
  zoom,
  panX,
  panY,
  onSelect,
  onDragPreview,
  onDragCommit,
  onDragCancel,
}: CommentMarkerButtonProps) {
  const canDrag = isThreadOwner(thread, currentAuthorId);
  const msgCount = thread.messages.length;
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef<{ startX: number; startY: number; moved: boolean } | null>(
    null
  );

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      if (
        Math.hypot(ev.clientX - dragRef.current.startX, ev.clientY - dragRef.current.startY) > 4
      ) {
        dragRef.current.moved = true;
      }
      const pt = clientToProjectWithViewport(canvas, ev.clientX, ev.clientY, zoom, panX, panY);
      onDragPreview(thread.id, pt.x, pt.y);
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(false);
      const moved = dragRef.current?.moved ?? false;
      dragRef.current = null;
      if (moved) {
        const pt = clientToProjectWithViewport(canvas, ev.clientX, ev.clientY, zoom, panX, panY);
        onDragCommit(thread.id, pt.x, pt.y);
      } else {
        onDragCancel();
        onSelect();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <button
      type="button"
      data-comment-pin="true"
      className={`comment-mode-marker${
        isActive ? ' comment-mode-marker-active' : ''
      }${thread.resolved ? ' comment-mode-marker-resolved' : ''}${
        canDrag ? ' comment-mode-marker-draggable' : ''
      }${dragging ? ' comment-mode-marker-dragging' : ''}`}
      style={{ left, top }}
      title={commentPinTitle(msgCount)}
      onMouseDown={canDrag ? handleMouseDown : undefined}
      onClick={
        canDrag
          ? (event) => event.stopPropagation()
          : (event) => {
              event.stopPropagation();
              onSelect();
            }
      }
    >
      <CommentMarkerPin
        name={thread.messages[0]?.authorName || '?'}
        count={msgCount}
      />
    </button>
  );
}

type MenuAnchor = {
  messageId: string;
  threadId: string;
  isOwn: boolean;
  top: number;
  left: number;
};

type MessageMenuProps = {
  anchor: MenuAnchor;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

function MessageActionMenu({
  anchor,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onClose,
}: MessageMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (menuRef.current?.contains(target)) return;
      if (target?.closest?.('[data-comment-message-menu-trigger]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  return createPortal(
    <div
      className="comment-mode-message-menu comment-mode-message-menu-portal"
      ref={menuRef}
      style={{ top: anchor.top, left: anchor.left }}
    >
      <button type="button" className="comment-mode-message-menu-item" onClick={onReply}>
        <CornerUpLeft size={14} />
        回复
      </button>
      {isOwn ? (
        <button type="button" className="comment-mode-message-menu-item" onClick={onEdit}>
          编辑
        </button>
      ) : null}
      {isOwn ? (
        <button
          type="button"
          className="comment-mode-message-menu-item comment-mode-message-menu-item-danger"
          onClick={onDelete}
        >
          删除
        </button>
      ) : null}
    </div>,
    document.body
  );
}

export default function CommentModeOverlay({ canvasRef }: Props) {
  const drawMode = useToolStore((s) => s.drawMode);
  const isCommentMode = drawMode === 'comment';
  const zoom = useCanvasStore((s) => s.zoom);
  const panX = useCanvasStore((s) => s.panX);
  const panY = useCanvasStore((s) => s.panY);
  const user = useAuthStore((s) => s.user);
  const content = useProjectContentStore((s) => s.content);
  const updatePartial = useProjectContentStore((s) => s.updatePartial);

  const threads = content?.comments ?? [];
  const authorId = user?.id ?? 'guest';
  const authorName = resolveAuthorName(user);

  const activeThreadId = useCommentStore((s) => s.activeThreadId);
  const setActiveThreadId = useCommentStore((s) => s.setActiveThreadId);
  const resetCommentStore = useCommentStore((s) => s.reset);

  const [draft, setDraft] = React.useState<DraftState | null>(null);
  const [draftText, setDraftText] = React.useState('');
  const [replyText, setReplyText] = React.useState('');
  const [replyToMessage, setReplyToMessage] = React.useState<CommentMessageSnapshot | null>(
    null
  );
  const [menuAnchor, setMenuAnchor] = React.useState<MenuAnchor | null>(null);
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [dragPreview, setDragPreview] = React.useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const draftInputRef = React.useRef<HTMLInputElement>(null);
  const replyInputRef = React.useRef<HTMLInputElement>(null);

  const activeThread = React.useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );

  const persistThreads = React.useCallback(
    (nextThreads: CommentThreadSnapshot[]) => {
      updatePartial({ comments: nextThreads });
    },
    [updatePartial]
  );

  const moveThreadPosition = React.useCallback(
    (threadId: string, x: number, y: number) => {
      persistThreads(
        threads.map((thread) =>
          thread.id === threadId ? { ...thread, x, y } : thread
        )
      );
    },
    [persistThreads, threads]
  );

  const getThreadProjectPoint = React.useCallback(
    (thread: CommentThreadSnapshot) => {
      if (dragPreview?.threadId === thread.id) {
        return { x: dragPreview.x, y: dragPreview.y };
      }
      return { x: thread.x, y: thread.y };
    },
    [dragPreview]
  );

  const resetReplyState = React.useCallback(() => {
    setReplyText('');
    setReplyToMessage(null);
  }, []);

  const selectThread = React.useCallback(
    (threadId: string) => {
      setDraft(null);
      setDraftText('');
      setActiveThreadId(threadId);
      resetReplyState();
      setMenuAnchor(null);
      setEditingMessageId(null);
    },
    [resetReplyState, setActiveThreadId]
  );

  React.useEffect(() => {
    if (!isCommentMode) {
      setDraft(null);
      setDraftText('');
      resetCommentStore();
      resetReplyState();
      setMenuAnchor(null);
      setEditingMessageId(null);
      setEditText('');
      setDragPreview(null);
    }
  }, [isCommentMode, resetCommentStore, resetReplyState]);

  React.useEffect(() => {
    const onCanvasClick = (event: Event) => {
      if (!isCommentMode) return;
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (typeof detail?.x !== 'number' || typeof detail?.y !== 'number') return;
      setActiveThreadId(null);
      resetReplyState();
      setMenuAnchor(null);
      setEditingMessageId(null);
      setDraft({ x: detail.x, y: detail.y });
      setDraftText('');
    };
    window.addEventListener('tanva:comment-canvas-click', onCanvasClick as EventListener);
    return () =>
      window.removeEventListener('tanva:comment-canvas-click', onCanvasClick as EventListener);
  }, [isCommentMode, resetReplyState]);

  React.useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => draftInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [draft]);

  React.useEffect(() => {
    if (!activeThreadId) return;
    const timer = window.setTimeout(() => replyInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [activeThreadId, replyToMessage]);

  const submitDraft = React.useCallback(() => {
    const text = draftText.trim();
    if (!text || !draft) return;
    const now = new Date().toISOString();
    const message: CommentMessageSnapshot = {
      id: createCommentId('msg'),
      authorId,
      authorName,
      content: text,
      createdAt: now,
    };
    const thread: CommentThreadSnapshot = {
      id: createCommentId('thread'),
      x: draft.x,
      y: draft.y,
      resolved: false,
      messages: [message],
      createdAt: now,
    };
    persistThreads([...threads, thread]);
    setDraft(null);
    setDraftText('');
    setActiveThreadId(thread.id);
  }, [authorId, authorName, draft, draftText, persistThreads, threads]);

  const submitReply = React.useCallback(() => {
    const text = replyText.trim();
    if (!text || !activeThreadId) return;
    const now = new Date().toISOString();
    const message: CommentMessageSnapshot = {
      id: createCommentId('msg'),
      authorId,
      authorName,
      content: text,
      createdAt: now,
      ...(replyToMessage
        ? {
            replyToMessageId: replyToMessage.id,
            replyToAuthorName: replyToMessage.authorName,
          }
        : {}),
    };
    persistThreads(
      threads.map((thread) =>
        thread.id === activeThreadId
          ? { ...thread, messages: [...thread.messages, message] }
          : thread
      )
    );
    resetReplyState();
  }, [
    activeThreadId,
    authorId,
    authorName,
    persistThreads,
    replyText,
    replyToMessage,
    resetReplyState,
    threads,
  ]);

  const saveEdit = React.useCallback(
    (threadId: string, messageId: string) => {
      const text = editText.trim();
      if (!text) return;
      persistThreads(
        threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: thread.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, content: text } : msg
                ),
              }
            : thread
        )
      );
      setEditingMessageId(null);
      setEditText('');
    },
    [editText, persistThreads, threads]
  );

  const deleteMessage = React.useCallback(
    (threadId: string, messageId: string) => {
      const nextThreads = threads
        .map((thread) => {
          if (thread.id !== threadId) return thread;
          const messages = thread.messages.filter((msg) => msg.id !== messageId);
          return messages.length ? { ...thread, messages } : null;
        })
        .filter(Boolean) as CommentThreadSnapshot[];

      persistThreads(nextThreads);
      if (!nextThreads.some((t) => t.id === threadId)) {
        setActiveThreadId(null);
      }
      setMenuAnchor(null);
      if (replyToMessage?.id === messageId) {
        resetReplyState();
      }
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditText('');
      }
    },
    [editingMessageId, persistThreads, replyToMessage, resetReplyState, threads]
  );

  const resolveThread = React.useCallback(
    (threadId: string) => {
      persistThreads(
        threads.map((thread) =>
          thread.id === threadId ? { ...thread, resolved: true } : thread
        )
      );
      setActiveThreadId(null);
      resetReplyState();
      setMenuAnchor(null);
    },
    [persistThreads, resetReplyState, threads]
  );

  const deleteThread = React.useCallback(
    (threadId: string) => {
      persistThreads(threads.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        resetReplyState();
      }
    },
    [activeThreadId, persistThreads, resetReplyState, threads]
  );

  const menuMessage =
    menuAnchor && activeThread
      ? activeThread.messages.find((msg) => msg.id === menuAnchor.messageId) ?? null
      : null;

  const canvas = canvasRef.current;
  if (!canvas) return null;

  const draftScreen = draft
    ? projectPointToScreen(canvas, draft.x, draft.y, zoom, panX, panY)
    : null;
  const activeProjectPoint = activeThread ? getThreadProjectPoint(activeThread) : null;
  const activeScreen = activeProjectPoint
    ? projectPointToScreen(
        canvas,
        activeProjectPoint.x,
        activeProjectPoint.y,
        zoom,
        panX,
        panY
      )
    : null;

  const openMessageMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    message: CommentMessageSnapshot,
    threadId: string,
    isOwn: boolean
  ) => {
    if (menuAnchor?.messageId === message.id) {
      setMenuAnchor(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 128;
    const menuHeight = isOwn ? 120 : 44;
    let left = rect.right + 8;
    let top = rect.top - 4;
    if (left + menuWidth > window.innerWidth - 8) {
      left = rect.left - menuWidth - 8;
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = window.innerHeight - menuHeight - 8;
    }
    top = Math.max(8, top);
    left = Math.max(8, left);
    setMenuAnchor({ messageId: message.id, threadId, isOwn, top, left });
  };

  const renderMessage = (message: CommentMessageSnapshot, threadId: string) => {
    const isOwn = message.authorId === authorId;
    const isEditing = editingMessageId === message.id;
    const isMenuOpen = menuAnchor?.messageId === message.id;

    return (
      <div key={message.id} className="comment-mode-message">
        <span className="comment-mode-message-avatar">
          {commentAuthorInitial(message.authorName)}
        </span>
        <div className="comment-mode-message-body">
          <div className="comment-mode-message-meta">
            <span className="comment-mode-message-author">{message.authorName}</span>
            <span className="comment-mode-message-time">
              {formatCommentTime(message.createdAt)}
            </span>
            <div className="comment-mode-message-menu-wrap">
              <button
                type="button"
                className="comment-mode-message-menu-btn"
                data-comment-message-menu-trigger={message.id}
                aria-label="更多操作"
                aria-expanded={isMenuOpen}
                onClick={(event) => openMessageMenu(event, message, threadId, isOwn)}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>

          {message.replyToAuthorName ? (
            <div className="comment-mode-reply-ref">
              回复 <span className="comment-mode-reply-at">@{message.replyToAuthorName}</span>
            </div>
          ) : null}

          {isEditing ? (
            <input
              className="comment-mode-message-edit-input"
              value={editText}
              autoFocus
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveEdit(threadId, message.id);
                }
                if (event.key === 'Escape') {
                  setEditingMessageId(null);
                  setEditText('');
                }
              }}
              onBlur={() => saveEdit(threadId, message.id)}
            />
          ) : (
            <div className="comment-mode-message-text">{message.content}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="comment-mode-root" aria-hidden={!isCommentMode && !draft && !activeThread}>
      {threads.map((thread) => {
        const point = getThreadProjectPoint(thread);
        const screen = projectPointToScreen(canvas, point.x, point.y, zoom, panX, panY);
        const isActive = activeThreadId === thread.id;
        if (isActive && activeScreen) return null;
        return (
          <CommentMarkerButton
            key={thread.id}
            canvas={canvas}
            thread={thread}
            left={screen.left}
            top={screen.top}
            isActive={false}
            currentAuthorId={authorId}
            zoom={zoom}
            panX={panX}
            panY={panY}
            onSelect={() => selectThread(thread.id)}
            onDragPreview={(threadId, x, y) => setDragPreview({ threadId, x, y })}
            onDragCommit={(threadId, x, y) => {
              setDragPreview(null);
              moveThreadPosition(threadId, x, y);
            }}
            onDragCancel={() => setDragPreview(null)}
          />
        );
      })}

      {draft && draftScreen && isCommentMode ? (
        <div
          className="comment-mode-composer"
          style={{ left: draftScreen.left + 20, top: draftScreen.top }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="comment-mode-composer-avatar">
            {commentAuthorInitial(authorName)}
          </span>
          <div className="comment-mode-composer-field">
            <input
              ref={draftInputRef}
              className="comment-mode-composer-input"
              value={draftText}
              placeholder="评论内容"
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitDraft();
                }
                if (event.key === 'Escape') {
                  setDraft(null);
                  setDraftText('');
                }
              }}
            />
            <button
              type="button"
              className="comment-mode-send-btn"
              disabled={!draftText.trim()}
              onClick={submitDraft}
              aria-label="发送评论"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {activeThread && activeScreen ? (
        <>
          <CommentMarkerButton
            canvas={canvas}
            thread={activeThread}
            left={activeScreen.left}
            top={activeScreen.top}
            isActive
            currentAuthorId={authorId}
            zoom={zoom}
            panX={panX}
            panY={panY}
            onSelect={() => selectThread(activeThread.id)}
            onDragPreview={(threadId, x, y) => setDragPreview({ threadId, x, y })}
            onDragCommit={(threadId, x, y) => {
              setDragPreview(null);
              moveThreadPosition(threadId, x, y);
            }}
            onDragCancel={() => setDragPreview(null)}
          />
          <div
            className="comment-mode-card"
            style={{
              left: Math.min(activeScreen.left + 24, window.innerWidth - 340),
              top: Math.max(16, activeScreen.top - 20),
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="comment-mode-card-header">
              <span className="comment-mode-card-title">评论</span>
              <div className="comment-mode-card-actions">
                {!activeThread.resolved ? (
                  <button
                    type="button"
                    className="comment-mode-resolve-btn"
                    onClick={() => resolveThread(activeThread.id)}
                  >
                    <Check size={14} />
                    解决
                  </button>
                ) : null}
                <button
                  type="button"
                  className="comment-mode-icon-btn"
                  onClick={() => deleteThread(activeThread.id)}
                  aria-label="删除评论"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  className="comment-mode-icon-btn"
                  onClick={() => {
                    setActiveThreadId(null);
                    resetReplyState();
                    setMenuAnchor(null);
                  }}
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="comment-mode-message-list">
              {activeThread.messages.map((message) => renderMessage(message, activeThread.id))}
            </div>

            {!activeThread.resolved ? (
              <div className="comment-mode-reply">
                <span className="comment-mode-message-avatar">
                  {commentAuthorInitial(authorName)}
                </span>
                <div className="comment-mode-reply-wrap">
                  {replyToMessage ? (
                    <div className="comment-mode-reply-hint-row">
                      <span className="comment-mode-reply-hint">
                        回复{' '}
                        <span className="comment-mode-reply-hint-at">
                          @{replyToMessage.authorName}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="comment-mode-reply-cancel"
                        onClick={() => setReplyToMessage(null)}
                        aria-label="取消回复"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className="comment-mode-reply-field">
                    <input
                      ref={replyInputRef}
                      className="comment-mode-reply-input"
                      value={replyText}
                      placeholder={
                        replyToMessage ? `回复 @${replyToMessage.authorName}` : '回复'
                      }
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitReply();
                        }
                        if (event.key === 'Escape') {
                          resetReplyState();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="comment-mode-send-btn"
                      disabled={!replyText.trim()}
                      onClick={submitReply}
                      aria-label="发送回复"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {menuAnchor && menuMessage ? (
        <MessageActionMenu
          anchor={menuAnchor}
          isOwn={menuAnchor.isOwn}
          onReply={() => {
            setReplyToMessage(menuMessage);
            setMenuAnchor(null);
            setEditingMessageId(null);
            replyInputRef.current?.focus();
          }}
          onEdit={() => {
            setEditingMessageId(menuMessage.id);
            setEditText(menuMessage.content);
            setMenuAnchor(null);
            setReplyToMessage(null);
          }}
          onDelete={() => deleteMessage(menuAnchor.threadId, menuAnchor.messageId)}
          onClose={() => setMenuAnchor(null)}
        />
      ) : null}
    </div>
  );
}
