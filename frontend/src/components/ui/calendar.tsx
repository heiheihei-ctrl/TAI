import * as React from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={zhCN}
      className={cn("rdp-root", className)}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
