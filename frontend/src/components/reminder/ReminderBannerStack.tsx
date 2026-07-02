import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { REMINDER_BANNER_HEIGHT_CLASS } from "@/components/reminder/reminderBannerLayout";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 顶部提醒横幅统一堆叠容器，保证多条横幅间距一致 */
export default function ReminderBannerStack({ children, className }: Props) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function reminderBannerRowClassName(themeClass: string) {
  return cn(REMINDER_BANNER_HEIGHT_CLASS, themeClass);
}
