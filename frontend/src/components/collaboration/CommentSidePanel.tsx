import React from 'react';
import {
  ArrowDownUp,
  MessageCircle,
  Search,
  Send,
  ImageIcon,
  X,
} from 'lucide-react';
import { useToolStore } from '@/stores/toolStore';
import { useProjectContentStore } from '@/stores/projectContentStore';
import { useAuthStore } from '@/stores/authStore';
import { useCommentStore } from '@/stores/commentStore';
import {
  commentAuthorInitial,
  createCommentId,
  formatCommentTime,
  type CommentMessageSnapshot,
  type CommentThreadSnapshot,
} from '@/types/comment';
import './comment-mode.css';

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

function threadMatchesSearch(thread: CommentThreadSnapshot, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return thread.messages.some(
    (msg) =>
      msg.content.toLowerCase().includes(q) ||
      msg.authorName.toLowerCase().includes(q)
  );
}

function getThreadPreview(thread: CommentThreadSnapshot): string {
  const last = thread.messages[thread.messages.length - 1];
  return last?.content?.trim() || '（无内容）';
}

function getThreadActivityTime(thread: CommentThreadSnapshot): string {
  const last = thread.messages[thread.messages.length - 1];
  return formatCommentTime(last?.createdAt || thread.createdAt);
}

function getThreadAuthorName(thread: CommentThreadSnapshot): string {
  return thread.messages[0]?.authorName || '用户';
}

type Props = {
  visible: boolean;
};

export default function CommentSidePanel({ visible }: Props) {
  const setDrawMode = useToolStore((s) => s.setDrawMode);
  const user = useAuthStore((s) => s.user);
  const threads = useProjectContentStore((s) => s.content?.comments ?? []);
  const updatePartial = useProjectContentStore((s) => s.updatePartial);

  const activeThreadId = useCommentStore((s) => s.activeThreadId);
  const searchQuery = useCommentStore((s) => s.searchQuery);
  const sortNewestFirst = useCommentStore((s) => s.sortNewestFirst);
  const setActiveThreadId = useCommentStore((s) => s.setActiveThreadId);
  const setSearchQuery = useCommentStore((s) => s.setSearchQuery);
  const toggleSortOrder = useCommentStore((s) => s.toggleSortOrder);
  const resetCommentStore = useCommentStore((s) => s.reset);

  const [replyText, setReplyText] = React.useState('');
  const replyInputRef = React.useRef<HTMLInputElement>(null);

  const authorId = user?.id ?? 'guest';
  const authorName = resolveAuthorName(user);

  const filteredThreads = React.useMemo(() => {
    const list = threads.filter((t) => !t.resolved && threadMatchesSearch(t, searchQuery));
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.messages[a.messages.length - 1]?.createdAt || a.createdAt);
      const tb = Date.parse(b.messages[b.messages.length - 1]?.createdAt || b.createdAt);
      return sortNewestFirst ? tb - ta : ta - tb;
    });
  }, [searchQuery, sortNewestFirst, threads]);

  const activeThread = React.useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );

  const prevVisibleRef = React.useRef(false);

  React.useEffect(() => {
    if (!visible) {
      prevVisibleRef.current = false;
      setReplyText('');
      return;
    }
    if (!prevVisibleRef.current && filteredThreads.length > 0 && !activeThreadId) {
      setActiveThreadId(filteredThreads[0].id);
    }
    prevVisibleRef.current = true;
  }, [activeThreadId, filteredThreads, setActiveThreadId, visible]);

  const closePanel = () => {
    resetCommentStore();
    setReplyText('');
    setDrawMode('select');
  };

  const submitReply = () => {
    const text = replyText.trim();
    if (!text || !activeThreadId) return;
    const now = new Date().toISOString();
    const message: CommentMessageSnapshot = {
      id: createCommentId('msg'),
      authorId,
      authorName,
      content: text,
      createdAt: now,
      ...(activeThread?.messages.length
        ? {
            replyToMessageId: activeThread.messages[activeThread.messages.length - 1].id,
            replyToAuthorName:
              activeThread.messages[activeThread.messages.length - 1].authorName,
          }
        : {}),
    };
    updatePartial({
      comments: threads.map((thread) =>
        thread.id === activeThreadId
          ? { ...thread, messages: [...thread.messages, message] }
          : thread
      ),
    });
    setReplyText('');
  };

  if (!visible) return null;

  return (
    <aside
      className={`comment-side-panel${visible ? ' comment-side-panel-open' : ''}`}
      aria-label="评论列表"
    >
      <header className="comment-side-panel-header">
        <h2 className="comment-side-panel-title">评论</h2>
        <button
          type="button"
          className="comment-side-panel-close"
          onClick={closePanel}
          aria-label="关闭评论面板"
        >
          <X size={18} />
        </button>
      </header>

      <div className="comment-side-panel-toolbar">
        <div className="comment-side-panel-search">
          <Search size={14} className="comment-side-panel-search-icon" />
          <input
            type="search"
            className="comment-side-panel-search-input"
            placeholder="搜索"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="comment-side-panel-sort"
          onClick={toggleSortOrder}
          title={sortNewestFirst ? '按时间：最新优先' : '按时间：最早优先'}
          aria-label="排序"
        >
          <ArrowDownUp size={16} />
        </button>
      </div>

      <p className="comment-side-panel-hint">
        <MessageCircle size={14} />
        点击页面任意位置，可添加评论。
      </p>

      <div className="comment-side-panel-list">
        {filteredThreads.length === 0 ? (
          <div className="comment-side-panel-empty">暂无评论</div>
        ) : (
          filteredThreads.map((thread) => {
            const author = getThreadAuthorName(thread);
            const isActive = thread.id === activeThreadId;
            const messageCount = thread.messages.length;
            return (
              <button
                key={thread.id}
                type="button"
                className={`comment-side-panel-item${isActive ? ' comment-side-panel-item-active' : ''}`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <div className="comment-side-panel-item-head">
                  <span className="comment-side-panel-item-avatar">
                    {commentAuthorInitial(author)}
                  </span>
                  <span className="comment-side-panel-item-author">{author}</span>
                  <span className="comment-side-panel-item-time">
                    {getThreadActivityTime(thread)}
                  </span>
                </div>
                <div className="comment-side-panel-item-body">{getThreadPreview(thread)}</div>
                {messageCount > 0 ? (
                  <div className="comment-side-panel-item-replies">
                    <MessageCircle size={12} />
                    <span>{messageCount}</span>
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <footer className="comment-side-panel-footer">
        <div className="comment-side-panel-footer-label">回复当前评论</div>
        <div className="comment-side-panel-reply-row">
          <button type="button" className="comment-side-panel-attach" aria-label="附件">
            <ImageIcon size={16} />
          </button>
          <input
            ref={replyInputRef}
            className="comment-side-panel-reply-input"
            placeholder="回复"
            value={replyText}
            disabled={!activeThreadId}
            onChange={(event) => setReplyText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitReply();
              }
            }}
          />
          <button
            type="button"
            className="comment-side-panel-send"
            disabled={!replyText.trim() || !activeThreadId}
            onClick={submitReply}
            aria-label="发送回复"
          >
            <Send size={16} />
          </button>
        </div>
      </footer>
    </aside>
  );
}
