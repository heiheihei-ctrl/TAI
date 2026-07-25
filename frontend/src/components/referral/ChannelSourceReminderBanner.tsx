import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ProfileRewardCredits from "@/components/profile/ProfileRewardCredits";
import { fetchWithAuth } from "@/services/authFetch";
import { notifyCreditsChanged } from "@/utils/creditsEvents";
import {
  REMINDER_BANNER_ACTIONS_CLASS,
  REMINDER_BANNER_ACTIONS_COMPACT_CLASS,
  REMINDER_BANNER_INNER_CLASS,
  REMINDER_BANNER_INNER_COMPACT_CLASS,
  REMINDER_BANNER_SHELL_CLASS,
  REMINDER_BANNER_SHELL_SIDE_CLASS,
} from "@/components/reminder/reminderBannerLayout";
import { reminderBannerRowClassName } from "@/components/reminder/ReminderBannerStack";

const CHANNELS = [
  "小红书",
  "抖音",
  "视频号",
  "B站",
  "公众号",
  "朋友推荐",
  "AI搜索",
  "其他渠道",
] as const;

const CLAIMED_KEY = "tanva_channel_reward_claimed";
const DISMISS_KEY = "tanva_channel-source-reminder-banner-dismissed-date";
const REWARD_CREDITS = 100;

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isChannelSourceRewardClaimed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLAIMED_KEY) === "true";
  } catch {
    return false;
  }
}

export function isChannelSourceBannerDismissedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === getLocalDateKey();
  } catch {
    return false;
  }
}

export function dismissChannelSourceBannerForToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, getLocalDateKey());
  } catch {
    /* ignore */
  }
}

export function markChannelSourceRewardClaimed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAIMED_KEY, "true");
  } catch {
    /* ignore */
  }
}

type Props = {
  sideBySide?: boolean;
  onDismiss?: () => void;
  onClaimed?: () => void;
};

export default function ChannelSourceReminderBanner({
  sideBySide = false,
  onDismiss,
  onClaimed,
}: Props) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        setModalOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, isSubmitting]);

  const handleDismiss = () => {
    dismissChannelSourceBannerForToday();
    onDismiss?.();
  };

  const handleClaim = async () => {
    if (!selectedChannel || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetchWithAuth("/api/credits/claim-source-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: selectedChannel }),
      });
      const result = await response.json().catch(() => ({}));

      if (result.success || result.alreadyClaimed) {
        markChannelSourceRewardClaimed();
        setModalOpen(false);
        notifyCreditsChanged();
        onClaimed?.();
        return;
      }
      setError(result.message || t("workspace.channelSourceReminder.claimFailed"));
    } catch {
      setError(t("workspace.channelSourceReminder.networkError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          sideBySide ? REMINDER_BANNER_SHELL_SIDE_CLASS : REMINDER_BANNER_SHELL_CLASS,
          reminderBannerRowClassName(
            "border-orange-200/70 bg-gradient-to-r from-orange-50 via-white to-amber-50/90",
          ),
          sideBySide && "border-l border-orange-200/50",
        )}
      >
        <div
          className={
            sideBySide
              ? REMINDER_BANNER_INNER_COMPACT_CLASS
              : REMINDER_BANNER_INNER_CLASS
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Gift className="h-4 w-4" />
            </div>
            <p
              className="truncate text-sm font-medium text-slate-900"
              title={t("workspace.channelSourceReminder.messageTitle")}
            >
              {t("workspace.channelSourceReminder.message")}
              <ProfileRewardCredits
                credits={REWARD_CREDITS}
                className="text-orange-600"
              />
              {t("workspace.channelSourceReminder.creditsSuffix")}
            </p>
          </div>
          <div
            className={
              sideBySide
                ? REMINDER_BANNER_ACTIONS_COMPACT_CLASS
                : REMINDER_BANNER_ACTIONS_CLASS
            }
          >
            <button
              type="button"
              onClick={() => {
                setError("");
                setModalOpen(true);
              }}
              className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 sm:text-sm"
            >
              {t("workspace.channelSourceReminder.action")}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={t("workspace.channelSourceReminder.dismiss")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
            onClick={() => {
              if (!isSubmitting) setModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.18)]"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="channel-source-modal-title"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="channel-source-modal-title"
                    className="text-base font-semibold text-slate-800"
                  >
                    {t("workspace.channelSourceReminder.modalTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("workspace.channelSourceReminder.modalDesc")}
                    <ProfileRewardCredits
                      credits={REWARD_CREDITS}
                      className="text-orange-600"
                    />
                    {t("workspace.channelSourceReminder.creditsSuffix")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSubmitting) setModalOpen(false);
                  }}
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={t("workspace.channelSourceReminder.closeModal")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((channel) => {
                  const active = selectedChannel === channel;
                  return (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => setSelectedChannel(channel)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "border-orange-500 bg-orange-50 text-orange-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {channel}
                    </button>
                  );
                })}
              </div>

              {error ? (
                <p className="mt-3 text-xs text-red-500">{error}</p>
              ) : null}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSubmitting) setModalOpen(false);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {t("workspace.channelSourceReminder.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={!selectedChannel || isSubmitting}
                  className="flex-1 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting
                    ? t("workspace.channelSourceReminder.submitting")
                    : t("workspace.channelSourceReminder.confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
