import { describe, expect, it } from 'vitest';
import { readVisualSnapshots, visualStatusLabel } from '../../frontend/src/utils/visualAgentEvents';

describe('Visual creation browser stream', () => {
  it('decodes fragmented Unicode snapshots', async () => {
    const bytes = new TextEncoder().encode('event: snapshot\r\ndata: {"title":"咖啡","turns":[]}\r\n\r\n');
    const stream = new ReadableStream({ start(controller) {
      for (let offset = 0; offset < bytes.length; offset++) controller.enqueue(bytes.slice(offset, offset + 1));
      controller.close();
    } });
    const snapshots: unknown[] = [];
    await readVisualSnapshots(stream, new AbortController().signal, snapshot => snapshots.push(snapshot));
    expect(snapshots).toEqual([{ title: '咖啡', turns: [] }]);
  });
  it('surfaces server-side stream errors', async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: error\ndata: {"message":"无权访问"}\n\n'));
      controller.close();
    } });
    await expect(readVisualSnapshots(stream, new AbortController().signal, () => {})).rejects.toThrow('无权访问');
  });
  it('distinguishes file collection and completion', () => {
    expect(visualStatusLabel('collecting')).toBe('正在转存产物');
    expect(visualStatusLabel('uncertain')).toBe('正在恢复云端状态');
    expect(visualStatusLabel('completed')).toBe('已完成');
  });
});
