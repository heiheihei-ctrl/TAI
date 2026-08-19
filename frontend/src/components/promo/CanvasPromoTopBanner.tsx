import { useCallback, useEffect, useState } from "react";
import {
  CANVAS_SUMMER_PROMO,
  getCanvasSummerPromoCountdown,
  isCanvasSummerPromoActive,
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
 * 倒计时：剩余 >12h 显示「N天」；≤12h 显示 HH:MM:SS。
 */
export default function CanvasPromoTopBanner({ className }: Props) {
  const [countdown, setCountdown] = useState<CanvasSummerPromoCountdown>(() =>
    getCanvasSummerPromoCountdown(),
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

  if (!isCanvasSummerPromoActive() || !countdown.active) {
    return null;
  }

  const countdownText =
    countdown.mode === "days"
      ? `仅剩 ${countdown.label}！`
      : `仅剩 ${countdown.label}！`;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          reminderBannerRowClassName(
            cn(
              REMINDER_BANNER_SHELL_CLASS,
              "border-amber-400/40 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.35)]",
              "cursor-pointer transition hover:brightness-105 active:brightness-95",
            ),
          ),
          className,
        )}
        aria-label="注册用户专属福利，点击查看套餐"
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-center gap-1.5 overflow-hidden px-3 text-center text-[12px] font-medium leading-snug sm:gap-2 sm:px-4 sm:text-[13px] md:text-sm">
          <span className="truncate">
            ✨天宫TAI&nbsp;注册用户专属福利——体验价仅
            {CANVAS_SUMMER_PROMO.priceYuan}
            元活动倒计时（{CANVAS_SUMMER_PROMO.priceYuan}
            元原积分6900，现合计满额到账
            {CANVAS_SUMMER_PROMO.dailyPlanMonthlyCredits}
            积分）｜⏰
            <span className="inline-flex items-baseline font-semibold tabular-nums tracking-wide">
              {countdownText}
            </span>
            🔥
          </span>
        </div>
      </button>
      <MembershipModal
        open={membershipOpen}
        onClose={() => setMembershipOpen(false)}
        publicBrowse={false}
        highlightMonthlyListPrice={CANVAS_SUMMER_PROMO.priceYuan}
      />
    </>
  );
}

/** 供顶栏偏移：活动期内且倒计时未结束时占一行横幅高度 */
export function useCanvasPromoTopBannerVisible(): boolean {
  const [visible, setVisible] = useState(
    () => isCanvasSummerPromoActive() && getCanvasSummerPromoCountdown().active,
  );

  useEffect(() => {
    const tick = () => {
      setVisible(
        isCanvasSummerPromoActive() && getCanvasSummerPromoCountdown().active,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return visible;
}
