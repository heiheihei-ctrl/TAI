export const getSeedanceDurations = (is25: boolean, toapis: boolean): number[] =>
  toapis
    ? Array.from({ length: (is25 ? 30 : 15) - 3 }, (_, index) => index + 4)
    : is25 ? [5, 10, 15, 20, 25, 30] : [5, 10, 15];

// Asset review alone may take 20 minutes, before generation starts (5-second polling).
export const getSeedancePollMaxAttempts = (taskId: string, fallback: number): number =>
  /^seedance(?:20|25)-toapis:/.test(taskId) ? 540 : fallback;
