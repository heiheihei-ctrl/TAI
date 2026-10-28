import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualAgentController } from './visual-agent.controller';

afterEach(() => vi.useRealTimers());
describe('Visual agent browser SSE', () => {
  it('waits for a slow reader to drain instead of truncating a large snapshot', async () => {
    vi.useFakeTimers();
    const raw = new EventEmitter();
    let stream!: PassThrough;
    const reply = { raw, header: vi.fn(), send: (value: PassThrough) => { stream = value; } };
    let revision = 0;
    const service = { get: vi.fn(async () => ({ revision: revision++, text: 'x'.repeat(40000) })) };
    await new VisualAgentController(service as any).events({ user: { id: 'u' } } as any, 's', reply as any);
    await vi.advanceTimersByTimeAsync(2000);
    expect(stream.destroyed).toBe(false);
    const chunks: string[] = [];
    stream.on('data', chunk => chunks.push(String(chunk)));
    await vi.advanceTimersByTimeAsync(1);
    expect(chunks.join('')).toContain('"revision":1');
    raw.emit('close');
  });
});
