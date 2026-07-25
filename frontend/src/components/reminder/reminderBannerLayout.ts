export const REMINDER_BANNER_HEIGHT_CLASS = "h-14";

export const REMINDER_BANNER_SHELL_CLASS =
  "pointer-events-auto w-full shrink-0 border-b backdrop-blur-md";

/** 与签到并排时的半宽壳层 */
export const REMINDER_BANNER_SHELL_SIDE_CLASS =
  "pointer-events-auto min-w-0 flex-1 shrink-0 border-b backdrop-blur-md";

export const REMINDER_BANNER_INNER_CLASS =
  "mx-auto flex h-full max-w-3xl items-center justify-between px-4";

export const REMINDER_BANNER_INNER_COMPACT_CLASS =
  "flex h-full w-full items-center justify-between gap-2 px-3 sm:px-4";

export const REMINDER_BANNER_ACTIONS_CLASS =
  "ml-[200px] flex shrink-0 items-center gap-2";

export const REMINDER_BANNER_ACTIONS_COMPACT_CLASS =
  "flex shrink-0 items-center gap-1.5 sm:gap-2";

export const REMINDER_BANNER_STACK_TOP_CLASS: Record<0 | 1 | 2, string> = {
  0: "top-4",
  1: "top-14",
  2: "top-28",
};
