import { describe, expect, it } from 'vitest';
import { buildAgentPayload, parseSseFrames, summarizeEvent, validateReferenceUrls, turnOutcome } from './visual-agent.protocol';

describe('Ark visual agent protocol', () => {
  it('buffers split CRLF frames and recognizes ready before user dispatch', () => {
    const first = parseSseFrames(': rea');
    expect(first.frames).toEqual([]);
    const next = parseSseFrames(first.rest + 'dy\r\n\r\ndata: {"type":"agent.message",\r\ndata: "content":[]}\r\n\r\ndata: partial');
    expect(next.frames[0].ready).toBe(true);
    expect(JSON.parse(next.frames[1].data!)).toEqual({ type: 'agent.message', content: [] });
    expect(next.rest).toBe('data: partial');
  });
  it('configures required toolsets with explicit models and disables overlapping search', () => {
    const agent = buildAgentPayload('main', 'image', 'video');
    expect(agent.base_agent).toBe('ultra_vision_agent_preview');
    expect(agent.model.reasoning_effort).toBe('high');
    expect(agent.tools[0].configs).toContainEqual({ name: 'web_search', enabled: false });
    expect(agent.tools[1].configs).toContainEqual({ name: 'image_generate', enabled: true, models: [{ id: 'image', default: true }] });
  });
  it('never persists binary blocks, tool inputs or signed links in event summaries', () => {
    expect(summarizeEvent({ id: 'e1', type: 'agent.message', content: [
      { type: 'text', text: '完成' }, { type: 'image', source: { data: 'base64-secret' } },
    ], input: { secret: 'hidden' } })).toEqual({ id: 'e1', type: 'agent.message', text: '完成' });
    expect(summarizeEvent({ id: 'e2', type: 'agent.tool_use', name: 'image_generate', input: { key: 'secret' } })).toEqual({ id: 'e2', type: 'agent.tool_use', name: 'image_generate' });
  });
  it('rejects runtime-only references and private hosts', () => {
    for (const url of ['data:image/png;base64,xxx', 'blob:abc', 'iVBORw0', 'http://127.0.0.1/a', 'https://localhost/a', 'http://169.254.169.254/a']) {
      expect(() => validateReferenceUrls([url])).toThrow();
    }
    expect(validateReferenceUrls(['https://cdn.example.com/a.png'])).toEqual(['https://cdn.example.com/a.png']);
  });
  it('does not mistake initial idle, retrying or rescheduled for success', () => {
    expect(turnOutcome({ type: 'session.status_idle' }, false)).toBe(null);
    expect(turnOutcome({ type: 'session.error', error: { retry_status: { type: 'retrying' } } }, true)).toBe(null);
    expect(turnOutcome({ type: 'session.status_rescheduled' }, true)).toBe(null);
    expect(turnOutcome({ type: 'session.status_idle', stop_reason: { type: 'requires_action' } }, true)).toBe('requires_action');
    expect(turnOutcome({ type: 'session.status_idle', stop_reason: { type: 'retries_exhausted' } }, true)).toBe('failed');
    expect(turnOutcome({ type: 'session.status_idle', stop_reason: { type: 'end_turn' } }, true)).toBe('completed');
  });
});
