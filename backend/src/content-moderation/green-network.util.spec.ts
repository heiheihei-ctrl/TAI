import { afterEach, describe, expect, it, vi } from 'vitest';
import { greenTimeout, retryGreenConnection } from './green-network.util';

afterEach(() => vi.useRealTimers());

describe('Green connection recovery', () => {
  it('retries a connection timeout once and returns the actual scan result', async () => {
    vi.useFakeTimers();
    const result = { riskLevel: 'high' };
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('ConnectTimeout: Connect HTTPS failed'))
      .mockResolvedValueOnce(result);
    const notify = vi.fn();
    const pending = retryGreenConnection(request, notify);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(result);
    expect(request).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not retry authentication or business errors', async () => {
    const error = Object.assign(new Error('Forbidden'), { code: 'Forbidden' });
    const request = vi.fn().mockRejectedValue(error);
    await expect(retryGreenConnection(request, vi.fn())).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('propagates a second failure without allowing content', async () => {
    vi.useFakeTimers();
    const error = Object.assign(new Error('connection failed'), { code: 'ConnectTimeout' });
    const request = vi.fn().mockRejectedValue(error);
    const assertion = expect(retryGreenConnection(request, vi.fn())).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('validates timeout configuration', () => {
    for (const raw of [undefined, '', 'NaN', '-1', '0', '999999']) {
      expect(greenTimeout(raw, 10000)).toBe(10000);
    }
    expect(greenTimeout('15000', 10000)).toBe(15000);
  });
});