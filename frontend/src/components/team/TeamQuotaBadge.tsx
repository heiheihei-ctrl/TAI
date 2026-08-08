import { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamStore } from '@/stores/teamStore';
import { teamApi } from '@/services/teamApi';
import {
  formatPersonalQuotaBadge,
  type PersonalTeamQuota,
} from '@/utils/teamQuotaDisplay';
import { CREDITS_REFRESH_EVENT } from '@/utils/creditsEvents';
import { TeamManagementModal } from './TeamManagementModal';
import { EnterpriseLedgerModal } from './EnterpriseLedgerModal';
import { SHOW_TEAM_COLLABORATION } from '@/config/featureFlags';

export default function TeamQuotaBadge() {
  const activeTeam = useTeamStore((s) => {
    const team = s.teams.find((t) => t.id === s.activeTeamId);
    return team && !team.isPersonal ? team : null;
  });
  const patchTeamCredits = useTeamStore((s) => s.patchTeamCredits);
  const [quota, setQuota] = useState<PersonalTeamQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!activeTeam) {
      setQuota(null);
      return;
    }

    let cancelled = false;

    const loadQuota = () => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      void teamApi
        .getMyQuota(activeTeam.id)
        .then((data) => {
          if (cancelled || seq !== loadSeqRef.current) return;
          setQuota(data);
          if (typeof data.teamBalance === 'number' && Number.isFinite(data.teamBalance)) {
            patchTeamCredits(activeTeam.id, Math.max(0, data.teamBalance));
          }
        })
        .catch(() => {
          if (!cancelled && seq === loadSeqRef.current) setQuota(null);
        })
        .finally(() => {
          if (!cancelled && seq === loadSeqRef.current) setLoading(false);
        });
    };

    loadQuota();

    const onCreditsRefresh = () => {
      loadQuota();
    };
    window.addEventListener(CREDITS_REFRESH_EVENT, onCreditsRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(CREDITS_REFRESH_EVENT, onCreditsRefresh);
    };
  }, [activeTeam?.id, patchTeamCredits]);

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
        onClick={() => setLedgerOpen(true)}
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

      {ledgerOpen && (
        <EnterpriseLedgerModal
          teamId={activeTeam.id}
          onClose={() => {
            setLedgerOpen(false);
            void teamApi
              .getMyQuota(activeTeam.id)
              .then((data) => {
                setQuota(data);
                if (typeof data.teamBalance === 'number' && Number.isFinite(data.teamBalance)) {
                  patchTeamCredits(activeTeam.id, Math.max(0, data.teamBalance));
                }
              })
              .catch(() => {});
          }}
        />
      )}

      {manageOpen && (
        <TeamManagementModal
          teamId={activeTeam.id}
          onClose={() => {
            setManageOpen(false);
            void teamApi
              .getMyQuota(activeTeam.id)
              .then((data) => {
                setQuota(data);
                if (typeof data.teamBalance === 'number' && Number.isFinite(data.teamBalance)) {
                  patchTeamCredits(activeTeam.id, Math.max(0, data.teamBalance));
                }
              })
              .catch(() => {});
          }}
          initialTab="members"
        />
      )}
    </>
  );
}
