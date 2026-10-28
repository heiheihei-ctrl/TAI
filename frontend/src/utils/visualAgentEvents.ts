export function visualStatusLabel(status: string): string {
  return ({ queued: '等待执行', running: '正在创作', collecting: '正在转存产物', settling: '正在结算', uncertain: '正在恢复云端状态',
    completed: '已完成', failed: '执行失败', interrupted: '已停止' } as Record<string, string>)[status] || status;
}

export async function readVisualSnapshots(body: ReadableStream<Uint8Array>, signal: AbortSignal, onSnapshot: (snapshot: unknown) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const lines = buffer.slice(0, match.index).split(/\r?\n/);
        buffer = buffer.slice(match.index + match[0].length);
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (event === 'error') throw new Error(parsed.message || '创作状态连接失败');
        if (event === 'snapshot') onSnapshot(parsed);
      }
      if (buffer.length > 8 * 1024 * 1024) throw new Error('创作事件过大');
      if (done) break;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
