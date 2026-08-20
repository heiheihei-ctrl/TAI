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
import { REMINDER_BANNER_SHELL_CLASS } from "@/components/reminder/reminderBannerLayout";
import { cn } from "@/lib/utils";

/** 与 VIP 弹窗「专业进阶」套餐卡边框一致（浅色主题） */
const PRO_TIER_BORDER_CLASS =
  "border-[#8E86F5]/60 shadow-[0_0_24px_-14px_rgba(142,134,245,0.38)]";

/** 与 VIP 弹窗「订阅月计划」按钮一致 */
const SUBSCRIBE_MONTHLY_BUTTON_CLASS =
  "shrink-0 rounded-[8px] bg-gradient-to-r from-[#8E86F5] to-[#9aa8ef] px-3 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition-transform hover:scale-[1.01] active:scale-[0.99] sm:px-4 sm:py-1";

type Props = {
  className?: string;
};

/**
 * 画布顶部促销横幅：活动期内展示，点击「订阅月计划」打开 69 元套餐购买。
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
    countdown.mode === "days" ? (
      <>
        仅剩{" "}
        <span className="text-[20px] font-semibold tabular-nums text-red-600">
          {countdown.days}
        </span>{" "}
        天⏰
      </>
    ) : (
      <>
        仅剩{" "}
        <span className="text-[20px] font-semibold tabular-nums text-red-600">
          {countdown.label}
        </span>
        ⏰
      </>
    );

  return (
    <>
      <div
        className={cn(
          REMINDER_BANNER_SHELL_CLASS,
          "border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-orange-50/90 py-3 sm:py-3.5",
          className,
        )}
      >
        <div className="relative mx-auto flex w-full max-w-6xl items-center justify-center px-10 sm:px-12">
          <div
            className={cn(
              "flex min-w-0 max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2",
              PRO_TIER_BORDER_CLASS,
            )}
          >
            <p className="min-w-0 truncate text-[16px] font-medium leading-snug text-slate-900">
              专属福利 {CANVAS_SUMMER_PROMO.priceYuan} 元即得{" "}
              <span className="font-semibold text-red-600">
                {CANVAS_SUMMER_PROMO.dailyPlanMonthlyCredits} 积分
              </span>
              🔥｜
              <span>{countdownLabel}</span>
            </p>
            <button
              type="button"
              onClick={handleOpen}
              className={SUBSCRIBE_MONTHLY_BUTTON_CLASS}
            >
              立即订阅
            </button>
          </div>
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
