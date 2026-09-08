import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toapisRequest } from './toapisHttpClient';

describe('toapisRequest cancellation and failover', () => {
  beforeEach(() => {
    vi.stubEnv('TOAPIS_API_BASE_URL', 'https://toapis.cn/v1');
    vi.stubEnv('TOAPIS_API_FALLBACK_BASE_URL', 'https://toapis.com/v1');
    vi.stubEnv('API_PROXY_URL', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('retries the fallback with the same timeout and signal', async () => {
    const controller = new AbortController();
    const response = { status: 200, data: { text: 'ok' } };
    const request = vi.spyOn(axios, 'request')
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      .mockResolvedValueOnce(response);

    await expect(toapisRequest({
      url: 'https://toapis.cn/v1/chat/completions',
      method: 'POST', timeout: 20000, signal: controller.signal,
    })).resolves.toBe(response);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toMatchObject({
      url: 'https://toapis.com/v1/chat/completions',
      timeout: 20000, signal: controller.signal,
    });
  });

  it('does not start fallback after the overall request is aborted', async () => {
    const controller = new AbortController();
    const error = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    const request = vi.spyOn(axios, 'request').mockImplementationOnce(async () => {
      controller.abort();
      throw error;
    });
    await expect(toapisRequest({
      url: 'https://toapis.cn/v1/chat/completions',
      method: 'POST', signal: controller.signal,
    })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves cancellation from the fallback request', async () => {
    const error = new axios.CanceledError('canceled');
    vi.spyOn(axios, 'request')
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      .mockRejectedValueOnce(error);
    await expect(toapisRequest({
      url: 'https://toapis.cn/v1/chat/completions', method: 'POST',
    })).rejects.toBe(error);
  });
});