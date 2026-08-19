import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  CANVAS_SUMMER_PROMO,
  CANVAS_SUMMER_PROMO_TOP_BANNER_DISMISS_EVENT,
  dismissCanvasSummerPromoTopBanner,
  getCanvasSummerPromoCountdown,
  shouldShowCanvasSummerPromoTopBanner,
  type CanvasSummerPromoCountdown,
} from "@/config/canvasSummerPromo";
import MembershipModal from "@/components/home/MembershipModal";
import {
  REMINDER_BANNER_SHELL_CLASS,
} from "@/components/reminder/reminderBannerLayout";
import { reminderBannerRowClassName } from "@/components/reminder/ReminderBannerStack";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/**
 * 画布顶部促销横幅：活动期内展示，点击打开 69 元套餐购买。
 * 倒计时：剩余 >12h 显示「N 天」；≤12h 显示 HH:MM:SS。
 */
export default function CanvasPromoTopBanner({ className }: Props) {
  const [countdown, setCountdown] = useState<CanvasSummerPromoCountdown>(() =>
    getCanvasSummerPromoCountdown(),
  );
  const [dismissed, setDismissed] = useState(
    () => !shouldShowCanvasSummerPromoTopBanner(),
  );
  const [membershipOpen, setMembershipOpen] = useState(false);

  useEffect(() => {
    const tick = () => setCountdown(getCanvasSummerPromoCountdown());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleOpen = useCallback(() => {
    setMembershipOpen(true);
  }, []);

  const handleDismiss = useCallback(() => {
    dismissCanvasSummerPromoTopBanner();
    setDismissed(true);
  }, []);

  if (dismissed || !countdown.active) {
    return null;
  }

  const countdownLabel =
    countdown.mode === "days"
      ? `仅剩 ${countdown.days} 天⏰`
      : `仅剩 ${countdown.label}⏰`;

  return (
    <>
      <div
        className={cn(
          REMINDER_BANNER_SHELL_CLASS,
          reminderBannerRowClassName(
            "border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-orange-50/90",
          ),
          className,
        )}
      >
        <div className="relative mx-auto flex h-full w-full max-w-6xl items-center justify-center px-10 sm:px-12">
          <button
            type="button"
            onClick={handleOpen}
            className="min-w-0 truncate text-sm font-medium text-slate-900"
            aria-label="专属福利，点击查看套餐"
          >
            专属福利 {CANVAS_SUMMER_PROMO.priceYuan} 元即得{" "}
            <span className="font-semibold text-red-600">
              {CANVAS_SUMMER_PROMO.dailyPlanMonthlyCredits} 积分
            </span>
            🔥｜
            <span className="tabular-nums">{countdownLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 sm:right-4"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <MembershipModal
        open={membershipOpen}
        onClose={() => setMembershipOpen(false)}
        publicBrowse={false}
        highlightMonthlyListPrice={CANVAS_SUMMER_PROMO.priceYuan}
      />
    </>
  );
}

/** 供顶栏偏移：活动期内且倒计时未结束、未关闭时占一行横幅高度 */
export function useCanvasPromoTopBannerVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    shouldShowCanvasSummerPromoTopBanner(),
  );

  useEffect(() => {
    const tick = () => setVisible(shouldShowCanvasSummerPromoTopBanner());
    tick();
    const id = window.setInterval(tick, 1000);
    window.addEventListener(CANVAS_SUMMER_PROMO_TOP_BANNER_DISMISS_EVENT, tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(
        CANVAS_SUMMER_PROMO_TOP_BANNER_DISMISS_EVENT,
        tick,
      );
    };
  }, []);

  return visible;
}
