export function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return '****';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function sanitizeCredentials(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => {
    const lowered = key.toLowerCase();
    if (
      lowered.includes('token') ||
      lowered.includes('secret') ||
      lowered.includes('password') ||
      lowered.includes('key')
    ) {
      return [key, typeof value === 'string' ? maskSecret(value) : '****'];
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return [key, sanitizeCredentials(value)];
    }

    return [key, value];
  });

  return Object.fromEntries(entries);
}
