import { Calendar, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ProfileRewardCredits from "@/components/profile/ProfileRewardCredits";
import {
  dismissCheckInReminderBannerForToday,
  type CheckInStatus,
} from "@/services/referralApi";
import { openSettingsSection } from "@/services/extendedProfileApi";
import {
  REMINDER_BANNER_ACTIONS_CLASS,
  REMINDER_BANNER_ACTIONS_COMPACT_CLASS,
  REMINDER_BANNER_INNER_CLASS,
  REMINDER_BANNER_INNER_COMPACT_CLASS,
  REMINDER_BANNER_SHELL_CLASS,
  REMINDER_BANNER_SHELL_SIDE_CLASS,
} from "@/components/reminder/reminderBannerLayout";
import { reminderBannerRowClassName } from "@/components/reminder/ReminderBannerStack";

type Props = {
  status: CheckInStatus;
  /** 与渠道来源横幅并排时使用半宽布局 */
  sideBySide?: boolean;
  onDismiss?: () => void;
};

export default function CheckInReminderBanner({
  status,
  sideBySide = false,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const weekTotalCredits =
    status.rewards?.reduce((sum, value) => sum + value, 0) ??
    status.todayReward * 6 + status.todayReward + status.weeklyBonus;

  const handleDismiss = () => {
    dismissCheckInReminderBannerForToday();
    onDismiss?.();
  };

  const handleGo = () => {
    openSettingsSection("referral");
  };

  return (
    <div
      className={cn(
        sideBySide ? REMINDER_BANNER_SHELL_SIDE_CLASS : REMINDER_BANNER_SHELL_CLASS,
        reminderBannerRowClassName(
          "border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-orange-50/90",
        ),
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Calendar className="h-4 w-4" />
          </div>
          <p
            className="truncate text-sm font-medium text-slate-900"
            title="每日签到 50 积分，第 7 天额外 +100，连续 7 天共 450 积分"
          >
            {status.consecutiveDays > 0
              ? t("workspace.checkInReminder.messageWithStreak", {
                  count: status.consecutiveDays,
                })
              : t("workspace.checkInReminder.message")}
            <ProfileRewardCredits
              credits={weekTotalCredits}
              className="text-amber-600"
            />
            {t("workspace.checkInReminder.creditsSuffix")}
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
            onClick={handleGo}
            className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 sm:text-sm"
          >
            {t("workspace.checkInReminder.action")}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={t("workspace.checkInReminder.dismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
