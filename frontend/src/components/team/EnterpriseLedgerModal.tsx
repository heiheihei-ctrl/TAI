import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronDown } from 'lucide-react';
import {
  teamCreditsApi,
  type TeamLedgerEntry,
  type TeamLedgerFilters,
} from '@/services/teamCreditsApi';
import { teamApi, type TeamMember } from '@/services/teamApi';
import { cn } from '@/lib/utils';

interface Props {
  teamId: string;
  onClose: () => void;
}

const PAGE = 30;

const NEGATIVE_TYPES = new Set(['reserve', 'deduct']);

function entryLabel(type: string): string {
  if (type === 'topup') return '充值';
  if (type === 'seat_package') return '席位购买';
  if (type === 'admin_add') return '管理员充值';
  if (type === 'reserve') return '冻结';
  if (type === 'deduct') return '扣款';
  if (type === 'release') return '解冻';
  if (type === 'refund') return '退款';
  return type;
}

function isNegative(type: string): boolean {
  return NEGATIVE_TYPES.has(type);
}

function actorDisplayName(entry: TeamLedgerEntry): string {
  if (entry.actorName) {
    return entry.actorPhoneTail
      ? `${entry.actorName}（****${entry.actorPhoneTail}）`
      : entry.actorName;
  }
  if (entry.actorUserId) {
    return `用户 ${entry.actorUserId.slice(0, 8)}`;
  }
  return '系统';
}

export function EnterpriseLedgerModal({ teamId, onClose }: Props) {
  const [entries, setEntries] = useState<TeamLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [skip, setSkip] = useState(0);

  const [members, setMembers] = useState<TeamMember[]>([]);

  // 筛选条件
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [search, setSearch] = useState('');
  // 实际生效的筛选条件（点击查询后才更新）
  const [appliedFilters, setAppliedFilters] = useState<TeamLedgerFilters>({});
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);

  // 加载成员列表（用于人员筛选下拉）
  useEffect(() => {
    teamApi
      .getMembers(teamId)
      .then(setMembers)
      .catch(() => {});
  }, [teamId]);

  // 点击外部关闭成员下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        memberDropdownRef.current &&
        !memberDropdownRef.current.contains(e.target as Node)
      ) {
        setMemberDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = useCallback(
    async (reset = false) => {
      setLoading(true);
      const nextSkip = reset ? 0 : skip;
      try {
        const data = await teamCreditsApi.getLedger(
          teamId,
          PAGE + 1,
          nextSkip,
          appliedFilters,
        );
        const page = data.slice(0, PAGE);
        setHasMore(data.length > PAGE);
        setEntries(reset ? page : (prev) => [...prev, ...page]);
        setSkip(nextSkip + PAGE);
      } catch {
        if (reset) setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [teamId, skip, appliedFilters],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, appliedFilters]);

  const handleSearch = () => {
    setAppliedFilters({
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      actorUserId: actorUserId || null,
      search: search.trim() || null,
    });
  };

  const handleReset = () => {
    setDateFrom('');
    setDateTo('');
    setActorUserId('');
    setSearch('');
    setAppliedFilters({});
  };

  const selectedMember = members.find((m) => m.userId === actorUserId);

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl mx-4 rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-slate-200/80 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">积分流水详情</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              按日期、人员筛选或搜索流水记录
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 筛选区域 */}
        <div className="px-6 py-3 border-b border-slate-100 shrink-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* 日期范围 */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 text-slate-600"
                placeholder="开始日期"
              />
              <span className="text-xs text-slate-400">至</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 text-slate-600"
                placeholder="结束日期"
              />
            </div>

            {/* 人员筛选下拉 */}
            <div className="relative" ref={memberDropdownRef}>
              <button
                type="button"
                onClick={() => setMemberDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none hover:border-slate-300 text-slate-600 min-w-[120px] justify-between"
              >
                <span className="truncate">
                  {selectedMember
                    ? selectedMember.user?.name ||
                      selectedMember.user?.email ||
                      selectedMember.userId.slice(0, 8)
                    : '全部人员'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
              {memberDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-10 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActorUserId('');
                      setMemberDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-slate-50',
                      actorUserId === '' ? 'text-blue-600 font-medium' : 'text-slate-600',
                    )}
                  >
                    全部人员
                  </button>
                  {members.map((m) => {
                    const name =
                      m.user?.name || m.user?.email || m.userId.slice(0, 8);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => {
                          setActorUserId(m.userId);
                          setMemberDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2',
                          actorUserId === m.userId
                            ? 'text-blue-600 font-medium'
                            : 'text-slate-600',
                        )}
                      >
                        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 shrink-0">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 搜索框 */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                  placeholder="搜索流水说明、类型"
                  className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 text-slate-600"
                />
              </div>
            </div>

            {/* 查询/重置按钮 */}
            <button
              type="button"
              onClick={handleSearch}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors"
            >
              查询
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              重置
            </button>
          </div>
        </div>

        {/* 流水列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              暂无积分流水记录
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
                          {
                            'bg-red-50 text-red-500': isNegative(entry.entryType),
                            'bg-emerald-50 text-emerald-600': !isNegative(
                              entry.entryType,
                            ),
                          },
                        )}
                      >
                        {entryLabel(entry.entryType)}
                      </span>
                      {(entry.note || entry.taskKind) && (
                        <span className="text-xs text-slate-500 truncate">
                          {entry.note || entry.taskKind}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[10px] text-slate-400">
                        {new Date(entry.createdAt).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-500">
                        操作人：{actorDisplayName(entry)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-semibold shrink-0',
                      isNegative(entry.entryType)
                        ? 'text-red-500'
                        : 'text-emerald-600',
                    )}
                  >
                    {isNegative(entry.entryType) ? '-' : '+'}
                    {Math.abs(entry.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <button
              onClick={() => load(false)}
              disabled={loading}
              className="mt-3 w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
            >
              {loading ? '加载中…' : '加载更多'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
