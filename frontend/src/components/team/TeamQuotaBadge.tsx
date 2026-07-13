import { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamStore } from '@/stores/teamStore';
import { teamApi } from '@/services/teamApi';
import {
  formatPersonalQuotaBadge,
  type PersonalTeamQuota,
} from '@/utils/teamQuotaDisplay';
import { TeamManagementModal } from './TeamManagementModal';
import { SHOW_TEAM_COLLABORATION } from '@/config/featureFlags';

export default function TeamQuotaBadge() {
  const activeTeam = useTeamStore((s) => {
    const team = s.teams.find((t) => t.id === s.activeTeamId);
    return team && !team.isPersonal ? team : null;
  });
  const [quota, setQuota] = useState<PersonalTeamQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    if (!activeTeam) {
      setQuota(null);
      return;
    }

    let cancelled = false;

    const loadQuota = () => {
      setLoading(true);
      void teamApi
        .getMyQuota(activeTeam.id)
        .then((data) => {
          if (cancelled) return;
          setQuota(data);
        })
        .catch(() => {
          if (!cancelled) setQuota(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    loadQuota();

    const onCreditsRefresh = () => {
      loadQuota();
    };
    window.addEventListener('refresh-credits', onCreditsRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('refresh-credits', onCreditsRefresh);
    };
  }, [activeTeam?.id]);

  const display = useMemo(() => {
    if (!activeTeam) return null;
    if (loading && !quota) {
      return { text: '...', title: '个人可用配额' };
    }
    if (!quota) {
      return { text: '--', title: '个人可用配额' };
    }
    return formatPersonalQuotaBadge(quota);
  }, [activeTeam, loading, quota]);

  if (!SHOW_TEAM_COLLABORATION || !activeTeam || !display) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setManageOpen(true)}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full border border-liquid-glass-light',
          'bg-liquid-glass-light px-2.5 text-xs text-gray-700 backdrop-blur-minimal',
          'transition-all hover:bg-liquid-glass-hover cursor-pointer',
        )}
        title={display.title}
      >
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-500">
          <User className="relative h-2.5 w-2.5 text-white" />
        </span>
        <span className="tabular-nums font-medium whitespace-nowrap">
          {display.text}
        </span>
      </button>

      {manageOpen && (
        <TeamManagementModal
          teamId={activeTeam.id}
          onClose={() => {
            setManageOpen(false);
            void teamApi
              .getMyQuota(activeTeam.id)
              .then((data) => setQuota(data))
              .catch(() => {});
          }}
          initialTab="members"
        />
      )}
    </>
  );
}
