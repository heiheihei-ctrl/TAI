import React from "react";
import { Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ProfileRewardCredits from "@/components/profile/ProfileRewardCredits";
import {
  dismissProfileCompletionBannerForToday,
  openSettingsSection,
  type ExtendedProfile,
} from "@/services/extendedProfileApi";

type Props = {
  profile: ExtendedProfile | null;
  onDismiss?: () => void;
};

export default function ProfileCompletionBanner({ profile, onDismiss }: Props) {
  const handleDismiss = () => {
    dismissProfileCompletionBannerForToday();
    onDismiss?.();
  };

  const handleGo = () => {
    openSettingsSection("profile");
  };

  if (!profile || profile.isComplete) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 top-0 z-[70] border-b border-violet-200/70",
        "bg-gradient-to-r from-violet-50 via-white to-indigo-50/90 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Gift className="h-4 w-4" />
          </div>
          <p className="truncate text-sm font-medium text-slate-900">
            完善个人信息可获得
            <ProfileRewardCredits credits={profile.rewardCredits || 100} />
            积分
          </p>
        </div>
        <div className="ml-[200px] flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleGo}
            className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 sm:text-sm"
          >
            去完善
          </button>
          <button
            type="button"
            onClick={handleDismiss}
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
