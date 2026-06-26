import React from "react";
import { Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";
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

  const rewardCredits = profile.rewardCredits || 50;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 top-0 z-[70] border-b border-violet-200/70",
        "bg-gradient-to-r from-violet-50 via-white to-indigo-50/90 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-sm leading-snug text-slate-700">
          <span className="font-medium text-slate-900">完善个人资料，领取 {rewardCredits} 积分</span>
          <span className="hidden sm:inline">
            {" "}
            · 补充真实姓名、性别、年龄、职业、公司与所在地区，即可用于个性化推荐，首次完成赠送 {rewardCredits} 积分。
          </span>
        </div>
        <button
          type="button"
          onClick={handleGo}
          className="shrink-0 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 sm:text-sm"
        >
          去完善
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭提示"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
