import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { VisualAgentService } from './visual-agent.service';
import { ArkRequestError } from './visual-agent.client';

function fixture() {
  const db = {
    project: { findUnique: vi.fn().mockResolvedValue({ userId: 'u', teamId: null }) },
    visualAgentSession: { findFirst: vi.fn(), updateMany: vi.fn() },
    visualAgentTurn: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
  const client = { request: vi.fn(), history: vi.fn(), files: vi.fn(), openStream: vi.fn(), download: vi.fn() };
  const oss = { isEnabled: () => true, putStream: vi.fn() };
  const credits = { preDeductCredits: vi.fn(), updateApiUsageStatus: vi.fn(), refundCredits: vi.fn() };
  const config = new ConfigService({ VISUAL_AGENT_ENABLED: 'true', ARK_API_KEY: 'key',
    VISUAL_AGENT_MODEL_ID: 'main', VISUAL_AGENT_IMAGE_MODEL_ID: 'image', VISUAL_AGENT_VIDEO_MODEL_ID: 'video',
    VISUAL_AGENT_CREDITS_PER_TURN: '80' });
  const service = new VisualAgentService(db as any, config, client as any, oss as any, credits as any, {} as any);
  return { service, db, client, credits, oss };
}

describe('VisualAgentService', () => {
  it('queries session ownership instead of trusting a supplied session id', async () => {
    const { service, db, client } = fixture();
    db.visualAgentSession.findFirst.mockResolvedValue(null);
    await expect(service.get('other-user', 'session')).rejects.toThrow('创作会话不存在');
    expect(db.visualAgentSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session', userId: 'other-user' } }));
    expect(client.request).not.toHaveBeenCalled();
  });
  it('does not charge or submit a duplicate request', async () => {
    const { service, db, credits } = fixture();
    db.visualAgentSession.findFirst.mockResolvedValue({ id: 's', projectId: 'p', activeTurnId: 't' });
    db.visualAgentTurn.findUnique.mockResolvedValue({ id: 't', prompt: 'hello', referenceUrls: [] });
    await expect(service.sendMessage('u', 's', { prompt: 'hello', requestId: 'same' })).resolves.toMatchObject({ id: 't' });
    expect(credits.preDeductCredits).not.toHaveBeenCalled();
  });
  it('rejects a busy session before charging', async () => {
    const { service, db, credits } = fixture();
    db.visualAgentSession.findFirst.mockResolvedValue({ id: 's', projectId: 'p', activeTurnId: 't' });
    db.visualAgentTurn.findUnique.mockResolvedValue(null);
    await expect(service.sendMessage('u', 's', { prompt: 'hello', requestId: 'new' })).rejects.toThrow('正在执行');
    expect(credits.preDeductCredits).not.toHaveBeenCalled();
  });
  it('locks a session against sends before starting cloud deletion', async () => {
    const { service, db, client } = fixture();
    const session = { id: 's', projectId: 'p', userId: 'u', activeTurnId: null, closing: false, upstreamId: 'sesn' };
    db.visualAgentSession.findFirst.mockImplementation(async () => ({ ...session }));
    db.visualAgentSession.updateMany.mockImplementation(async ({ data }: any) => { Object.assign(session, data); return { count: 1 }; });
    (db.visualAgentSession as any).deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    db.visualAgentTurn.findUnique.mockResolvedValue(null);
    client.request.mockImplementation(async () => {
      expect(session.closing).toBe(true);
      await expect(service.sendMessage('u', 's', { prompt: 'new', requestId: 'new' })).rejects.toThrow('关闭');
      return {};
    });
    await service.remove('u', 's');
  });
  it('stores only managed URLs and rejects empty storage results', async () => {
    const { service, client, oss } = fixture();
    client.files.mockResolvedValue([{ id: 'file-1', filename: 'out.png', mime_type: 'image/png', download_url: 'https://tos.volces.com/signed' }]);
    client.download.mockResolvedValue(Readable.from(['png']));
    oss.putStream.mockResolvedValue({ key: 'projects/p/asset.png', url: '' });
    await expect(service.collectArtifacts({ projectId: 'p', upstreamId: 'sesn' } as any, [])).rejects.toThrow('转存');
  });
  it('skips files already copied on a previous turn', async () => {
    const { service, client } = fixture();
    client.files.mockResolvedValue([{ id: 'file-1', filename: 'out.png', mime_type: 'image/png', download_url: 'https://tos.volces.com/signed' }]);
    const artifacts = [{ id: 'file-1', filename: 'out.png', mimeType: 'image/png', key: 'projects/p/out.png', url: 'https://cdn.example.com/out.png' }];
    expect(await service.collectArtifacts({ projectId: 'p', upstreamId: 'sesn' } as any, artifacts)).toEqual([]);
    expect(client.download).not.toHaveBeenCalled();
  });
});

// The in-memory repository models conditional leases and durable turn state; upstream I/O is stubbed.
function workerFixture(overrides: Record<string, unknown> = {}) {
  const session = { id: 's', userId: 'u', projectId: 'p', upstreamId: 'sesn', activeTurnId: 't' };
  const row: any = { id: 't', sessionId: 's', requestId: 'r', prompt: 'coffee', referenceUrls: [],
    apiUsageId: 'usage', status: 'running', submission: 'sent', cursor: 'baseline', outcome: null,
    seenRunning: false, events: [], artifacts: [], leaseOwner: null, leaseUntil: null,
    createdAt: new Date(), ...overrides };
  const matches = (where: any) => {
    if (where.id && where.id !== row.id) return false;
    if (where.leaseOwner && where.leaseOwner !== row.leaseOwner) return false;
    if (where.leaseUntil?.gt && (!row.leaseUntil || row.leaseUntil <= where.leaseUntil.gt)) return false;
    if (where.submission && where.submission !== row.submission) return false;
    return true;
  };
  const db: any = {
    project: { findUnique: vi.fn().mockResolvedValue({ userId: 'u', teamId: null }) },
    visualAgentSession: { updateMany: vi.fn(async ({ data }: any) => { Object.assign(session, data); return { count: 1 }; }) },
    visualAgentTurn: {
      updateMany: vi.fn(async ({ where, data }: any) => { if (!matches(where)) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }),
      update: vi.fn(async ({ data }: any) => { Object.assign(row, data); return { ...row }; }),
      findUniqueOrThrow: vi.fn(async () => ({ ...row, session })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: async (fn: any) => typeof fn === 'function' ? fn(db) : Promise.all(fn),
  };
  const client = {
    openStream: vi.fn().mockResolvedValue({ ready: Promise.resolve(), done: Promise.resolve(), close: vi.fn() }),
    history: vi.fn().mockResolvedValue([]), request: vi.fn().mockResolvedValue({}), files: vi.fn().mockResolvedValue([]),
    download: vi.fn(async () => Readable.from(['png'])),
  };
  const credits = { updateApiUsageStatus: vi.fn(), refundCredits: vi.fn() };
  const oss = { putStream: vi.fn(async (key: string) => ({ key, url: `https://cdn.example.com/${key}` })) };
  const service = new VisualAgentService(db, new ConfigService({}), client as any, oss as any, credits as any, {} as any);
  const run = () => (service as any).execute('t') as Promise<void>;
  return { row, session, db, client, credits, service, run };
}

afterEach(() => vi.useRealTimers());

describe('Visual agent execution recovery', () => {
  it('cancels a queued turn without charging or submitting it', async () => {
    const f = workerFixture({ submission: 'pending', apiUsageId: null, cancelRequested: true });
    await f.run();
    expect(f.row.status).toBe('interrupted');
    expect(f.session.activeTurnId).toBeNull();
    expect(f.client.request).not.toHaveBeenCalled();
  });
  it('reconciles a terminal event even after the execution deadline', async () => {
    const f = workerFixture({ createdAt: new Date(Date.now() - 46 * 60000) });
    f.client.history.mockResolvedValue([
      { id: 'running', type: 'session.status_running' },
      { id: 'end', type: 'session.status_idle', stop_reason: { type: 'interrupted' } },
    ]);
    await f.run();
    expect(f.row.status).toBe('interrupted');
    expect(f.session.activeTurnId).toBeNull();
  });
  it('persists terminal outcome together with cursor before a transfer failure', async () => {
    const f = workerFixture();
    f.client.history.mockResolvedValue([
      { id: 'running', type: 'session.status_running' },
      { id: 'end', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
    ]);
    f.client.files.mockRejectedValue(new Error('storage unavailable'));
    await f.run();
    expect(f.row.cursor).toBe('end');
    expect(f.row.outcome).toBe('completed');
    expect(f.row.status).toBe('collecting');
  });
  it('fences a stale worker before it can send a paid user message', async () => {
    const f = workerFixture({ submission: 'pending', createdAt: new Date(Date.now() - 46 * 60000) });
    f.client.history.mockImplementation(async () => { f.row.leaseOwner = 'replacement-worker'; return []; });
    await f.run();
    expect(f.row.submission).toBe('pending');
    expect(f.client.request.mock.calls.some((call: any[]) => call[2]?.events?.some((e: any) => e.type === 'user.message'))).toBe(false);
  });
  it('waits for ready before submitting the user event', async () => {
    const f = workerFixture({ submission: 'pending' });
    let ready!: () => void;
    f.client.openStream.mockResolvedValue({ ready: new Promise<void>(resolve => { ready = resolve; }), done: Promise.resolve(), close: vi.fn() });
    f.client.history.mockResolvedValueOnce([]).mockResolvedValue([
      { id: 'running', type: 'session.status_running' },
      { id: 'end', type: 'session.status_idle', stop_reason: { type: 'interrupted' } },
    ]);
    const execution = f.run();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(f.client.request).not.toHaveBeenCalled();
    ready();
    await execution;
    expect(f.row.status).toBe('interrupted');
  });
  it('releases the session and refunds a definitively rejected submission', async () => {
    const f = workerFixture({ submission: 'pending' });
    f.client.request.mockRejectedValue(new ArkRequestError(403, true));
    await f.run();
    expect(f.row.status).toBe('failed');
    expect(f.session.activeTurnId).toBeNull();
    expect(f.credits.refundCredits).toHaveBeenCalledWith('u', 'usage');
  });
  it('collects a delayed file on a completed turn without stealing another turn output', async () => {
    const f = workerFixture({ status: 'completed', outcome: 'completed', artifactSyncUntil: new Date(Date.now() + 60000) });
    f.client.files.mockResolvedValue([
      { id: 'late', filename: 'tanva-t__late.png', mime_type: 'image/png', download_url: 'https://tos.volces.com/late' },
      { id: 'other', filename: 'tanva-other__out.png', mime_type: 'image/png', download_url: 'https://tos.volces.com/other' },
    ]);
    await f.run();
    expect(f.row.artifacts.map((a: any) => a.id)).toEqual(['late']);
    expect(f.client.request).not.toHaveBeenCalled();
    expect(f.row.status).toBe('completed');
  });
});
