export function greenTimeout(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1000 && value <= 120000
    ? Math.floor(value)
    : fallback;
}

/** Only retry connection establishment failures, not moderation/API rejections. */
export async function retryGreenConnection<T>(
  request: () => Promise<T>,
  onRetry: () => void,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ConnectTimeout' && !/^ConnectTimeout:/.test(err?.message || '')) {
      throw error;
    }
    onRetry();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return request();
  }
}