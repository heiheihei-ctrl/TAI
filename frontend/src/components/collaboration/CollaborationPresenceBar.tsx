import React, { useMemo } from 'react';
import type { CollaborationPeer } from '@/services/collaborationSocket';
import { dedupePeersByUser } from '@/services/collaborationSocket';

interface Props {
  peers: CollaborationPeer[];
  currentUserId?: string | null;
}

function initials(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const cjk = trimmed.match(/[\u4e00-\u9fff]/);
  if (cjk) return trimmed.slice(-1);
  return trimmed.slice(0, 1).toUpperCase();
}

/**
 * 团队项目在线协作者头像条（与 Tanva CollabPresenceBar 同用途）。
 */
export default function CollaborationPresenceBar({ peers, currentUserId }: Props) {
  const online = useMemo(() => dedupePeersByUser(peers), [peers]);
  if (online.length === 0) return null;

  const sorted = [...online].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return 0;
  });
  const shown = sorted.slice(0, 6);
  const extra = sorted.length - shown.length;

  return (
    <div
      className="fixed z-[8000] flex items-center"
      style={{ top: 72, right: 24, pointerEvents: 'none' }}
    >
      <div
        className="flex items-center rounded-full bg-white/90 px-2.5 py-1.5 shadow-md backdrop-blur dark:bg-slate-900/90"
        style={{ pointerEvents: 'auto' }}
        title={`${online.length} 人在线协作`}
      >
        <div className="flex -space-x-2">
          {shown.map((u) => {
            const isSelf = u.userId === currentUserId;
            return (
              <div
                key={u.userId}
                title={isSelf ? `${u.name}（你）` : u.name}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white dark:border-slate-800"
                style={{ background: u.color }}
              >
                {initials(u.name)}
              </div>
            );
          })}
          {extra > 0 && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-500 text-xs font-semibold text-white dark:border-slate-800"
              title={`另有 ${extra} 人在线`}
            >
              +{extra}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
