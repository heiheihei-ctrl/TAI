import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { VisualAgentClient } from './visual-agent.client';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));

describe('VisualAgentClient', () => {
  it('reports upstream code and request ID without exposing credentials or response messages', async () => {
    vi.mocked(axios.request).mockRejectedValueOnce({ response: { status: 400,
      headers: { 'x-request-id': 'request-123' },
      data: { error: { code: 'InvalidParameter.Environment', message: 'secret-key private prompt' } },
    } });
    const client = new VisualAgentClient(new ConfigService({ ARK_API_KEY: 'secret-key' }));
    try {
      await client.request('POST', '/environments', {});
      expect.fail('expected rejection');
    } catch (error: any) {
      expect(error.message).toContain('POST /environments');
      expect(error.message).toContain('InvalidParameter.Environment');
      expect(error.message).toContain('request-123');
      expect(error.message).not.toContain('secret-key');
      expect(error.message).not.toContain('private prompt');
    }
  });
  it('allows cleanup to resume after a previously deleted cloud resource', async () => {
    vi.mocked(axios.request).mockRejectedValueOnce({ response: { status: 404 } });
    const client = new VisualAgentClient(new ConfigService({ ARK_API_KEY: 'key' }));
    await expect(client.request('DELETE', '/sessions/deleted')).resolves.toEqual({});
  });
  it('waits for SSE ready and reads events split across chunks', async () => {
    const source = new Readable({ read() {} });
    vi.mocked(axios.request).mockResolvedValueOnce({ data: source });
    const client = new VisualAgentClient(new ConfigService({ ARK_API_KEY: 'test' }));
    const events: unknown[] = [];
    let ready = false;
    const stream = await client.openStream('sesn-test', e => { events.push(e); });
    const waiting = stream.ready.then(() => { ready = true; });
    source.push(': rea');
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(ready).toBe(false);
    source.push('dy\n\ndata: {"type":"session.status_running"}\n\n');
    await waiting;
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(events).toEqual([{ type: 'session.status_running' }]);
    stream.close();
  });
  it('does not attach the API key to download URLs', async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({ data: Readable.from(['png']) });
    const client = new VisualAgentClient(new ConfigService({ ARK_API_KEY: 'secret', VISUAL_AGENT_DOWNLOAD_HOSTS: 'cdn.example.com' }));
    await client.download('https://cdn.example.com/out.png');
    const calls = vi.mocked(axios.request).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.headers?.Authorization).toBeUndefined();
    expect(call.maxRedirects).toBe(0);
  });
});
