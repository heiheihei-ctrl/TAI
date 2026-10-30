export const getSeedanceDurations = (is25: boolean, toapis: boolean): number[] =>
  toapis
    ? Array.from({ length: (is25 ? 30 : 15) - 3 }, (_, index) => index + 4)
    : is25 ? [5, 10, 15, 20, 25, 30] : [5, 10, 15];

// Asset review alone may take 20 minutes, before generation starts (5-second polling).
export const getSeedancePollMaxAttempts = (taskId: string, fallback: number): number =>
  /^seedance(?:20|25)-toapis:/.test(taskId) ? 540 : fallback;

export const isLegacySeedanceSelection = (value: unknown): boolean =>
  !['seedance-2.0', 'seedance-2.0-fast', 'seedance-2.5'].includes(String(value || '').trim().toLowerCase());

export const migrateLegacySeedanceSelection = (duration: unknown, toapis: boolean, mode?: unknown) => {
  const seconds = typeof duration === 'number' && Number.isFinite(duration) ? Math.round(duration) : 5;
  return {
    seedanceModel: 'seedance-2.5', managedModelKey: 'seedance-2.5',
    seedanceMode: ['start_end', 'first_frame', 'image'].includes(String(mode)) ? 'start_end' : 'reference_images',
    clipDuration: toapis ? Math.max(4, Math.min(30, seconds)) : Math.max(5, Math.min(30, Math.round(seconds / 5) * 5)),
  };
};
