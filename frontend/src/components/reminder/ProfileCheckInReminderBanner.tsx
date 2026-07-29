import { Calendar, Gift, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ProfileRewardCredits from "@/components/profile/ProfileRewardCredits";
import {
  openSettingsSection,
  type ExtendedProfile,
} from "@/services/extendedProfileApi";
import type { CheckInStatus } from "@/services/referralApi";
import {
  REMINDER_BANNER_ACTIONS_CLASS,
  REMINDER_BANNER_INNER_CLASS,
  REMINDER_BANNER_SHELL_CLASS,
} from "@/components/reminder/reminderBannerLayout";
import { reminderBannerRowClassName } from "@/components/reminder/ReminderBannerStack";

type Props = {
  profile: ExtendedProfile | null;
  checkInStatus: CheckInStatus | null;
  showProfile: boolean;
  showCheckIn: boolean;
  fading?: boolean;
  onDismiss?: () => void;
};

export default function ProfileCheckInReminderBanner({
  profile,
  checkInStatus,
  showProfile,
  showCheckIn,
  fading = false,
  onDismiss,
}: Props) {
  const { t } = useTranslation();

  const weekTotalCredits =
    checkInStatus?.rewards?.reduce((sum, value) => sum + value, 0) ??
    (checkInStatus
      ? checkInStatus.todayReward * 6 +
        checkInStatus.todayReward +
        checkInStatus.weeklyBonus
      : 0);

  if (!showProfile && !showCheckIn) {
    return null;
  }

  return (
    <div
      className={cn(
        REMINDER_BANNER_SHELL_CLASS,
        reminderBannerRowClassName(
          "border-violet-200/70 bg-gradient-to-r from-violet-50 via-white to-amber-50/90 transition-all duration-700 ease-out",
        ),
        fading && "pointer-events-none translate-y-[-2px] opacity-0",
      )}
    >
      <div className={REMINDER_BANNER_INNER_CLASS}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-amber-100 text-violet-600">
            {showProfile ? <Gift className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          </div>
          <div className="min-w-0 truncate text-sm font-medium text-slate-900">
            {showProfile ? (
              <span>
                完善个人信息可获得
                <ProfileRewardCredits credits={profile?.rewardCredits || 100} />
                积分
              </span>
            ) : null}
            {showProfile && showCheckIn ? (
              <span className="mx-1.5 text-slate-300">·</span>
            ) : null}
            {showCheckIn && checkInStatus ? (
              <span>
                {checkInStatus.consecutiveDays > 0
                  ? t("workspace.checkInReminder.messageWithStreak", {
                      count: checkInStatus.consecutiveDays,
                    })
                  : t("workspace.checkInReminder.message")}
                <ProfileRewardCredits
                  credits={weekTotalCredits}
                  className="text-amber-600"
                />
                {t("workspace.checkInReminder.creditsSuffix")}
              </span>
            ) : null}
          </div>
        </div>
        <div className={REMINDER_BANNER_ACTIONS_CLASS}>
          {showProfile ? (
            <button
              type="button"
              onClick={() => openSettingsSection("profile")}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 sm:text-sm"
            >
              去完善
            </button>
          ) : null}
          {showCheckIn ? (
            <button
              type="button"
              onClick={() => openSettingsSection("referral")}
              className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 sm:text-sm"
            >
              {t("workspace.checkInReminder.action")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭提示"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
