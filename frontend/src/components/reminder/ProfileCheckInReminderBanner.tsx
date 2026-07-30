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
  REMINDER_BANNER_HEIGHT_CLASS,
  REMINDER_BANNER_SHELL_SIDE_CLASS,
} from "@/components/reminder/reminderBannerLayout";

const BANNER_INNER_CENTER_CLASS =
  "mx-auto flex h-full w-full max-w-xl items-center justify-center gap-3 px-3 sm:px-4";

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

  const sideBySide = showProfile && showCheckIn;

  if (!showProfile && !showCheckIn) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full shrink-0 border-b backdrop-blur-md transition-all duration-700 ease-out",
        REMINDER_BANNER_HEIGHT_CLASS,
        sideBySide
          ? "border-slate-200/70"
          : showProfile
            ? "border-violet-200/70 bg-gradient-to-r from-violet-50 via-white to-indigo-50/90"
            : "border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-orange-50/90",
        fading && "pointer-events-none translate-y-[-2px] opacity-0",
      )}
    >
      {showProfile ? (
        <div
          className={cn(
            sideBySide ? REMINDER_BANNER_SHELL_SIDE_CLASS : "min-w-0 flex-1",
            sideBySide &&
              "border-b-0 border-r border-violet-200/50 bg-gradient-to-r from-violet-50 via-white to-indigo-50/90",
          )}
        >
          <div className={BANNER_INNER_CENTER_CLASS}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <Gift className="h-4 w-4" />
              </div>
              <p
                className="truncate text-sm font-medium text-slate-900"
                title="完善个人信息可获得积分"
              >
                完善个人信息可获得
                <ProfileRewardCredits credits={profile?.rewardCredits || 100} />
                积分
              </p>
            </div>
            <button
              type="button"
              onClick={() => openSettingsSection("profile")}
              className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 sm:text-sm"
            >
              去完善
            </button>
          </div>
        </div>
      ) : null}

      {showCheckIn && checkInStatus ? (
        <div
          className={cn(
            sideBySide ? REMINDER_BANNER_SHELL_SIDE_CLASS : "min-w-0 flex-1",
            sideBySide &&
              "border-b-0 border-l border-amber-200/50 bg-gradient-to-r from-amber-50 via-white to-orange-50/90",
            !sideBySide &&
              "bg-gradient-to-r from-amber-50 via-white to-orange-50/90",
          )}
        >
          <div className={BANNER_INNER_CENTER_CLASS}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Calendar className="h-4 w-4" />
              </div>
              <p
                className="truncate text-sm font-medium text-slate-900"
                title="每日签到积分"
              >
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
              </p>
            </div>
            <button
              type="button"
              onClick={() => openSettingsSection("referral")}
              className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 sm:text-sm"
            >
              {t("workspace.checkInReminder.action")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center border-l border-slate-200/60 px-2 sm:px-3">
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
  );
}
