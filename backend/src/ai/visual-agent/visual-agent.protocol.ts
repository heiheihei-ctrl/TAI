import { isIP } from 'node:net';

export type ArkEvent = { id?: string; type: string; [key: string]: any };
export type VisualEvent = { id?: string; type: string; text?: string; name?: string; isError?: boolean };
export type VisualArtifact = { id: string; filename: string; mimeType: string; key: string; url: string };

export function assertPublicUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || !host.includes('.') ||
    (isIP(host) && (host.includes(':') || /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(host)))) {
    throw new Error('图片和产物必须使用公网 HTTP(S) URL');
  }
  return url.href;
}

export function validateReferenceUrls(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8 || value.some(v => typeof v !== 'string' || v.length > 8192)) {
    throw new Error('最多支持 8 张远程参考图');
  }
  return [...new Set(value.map(assertPublicUrl))];
}

export function buildAgentPayload(main: string, image: string, video: string) {
  return {
    name: `tanva-visual-${Date.now()}`,
    description: 'Tanva 图片与视频创作助手',
    base_agent: 'ultra_vision_agent_preview',
    model: { id: main, reasoning_effort: 'high' },
    system: '你是 Tanva 视觉创作助手，协助用户完成图片、视频与素材合成。使用用户提供的参考素材和当前裁剪结果。将最终交付文件保存到 /mnt/session/outputs/。明确说明产物和失败原因，不要将图片编码成 base64 放在回复中。',
    tools: [
      { type: 'agent_toolset_20260916', default_config: { enabled: true, permission_policy: { type: 'always_allow' } }, configs: [{ name: 'web_search', enabled: false }] },
      { type: 'agent_toolset_multimodal_20260825', default_config: { enabled: false, permission_policy: { type: 'always_allow' } }, configs: [
        { name: 'image_generate', enabled: true, models: [{ id: image, default: true }] },
        { name: 'video_generate', enabled: true, models: [{ id: video, default: true }] },
        { name: 'visual_search', enabled: true }, { name: 'general_search', enabled: true },
        { name: 'compose_video', enabled: true },
      ] },
    ],
  };
}

export function parseSseFrames(buffer: string): { frames: { ready: boolean; data?: string }[]; rest: string } {
  const frames: { ready: boolean; data?: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = /\r?\n\r?\n/.exec(buffer))) {
    const lines = buffer.slice(0, match.index).split(/\r?\n/);
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    frames.push({ ready: lines.some(line => line.trim() === ': ready'), ...(data ? { data } : {}) });
    buffer = buffer.slice(match.index + match[0].length);
  }
  return { frames, rest: buffer };
}

export function summarizeEvent(event: ArkEvent): VisualEvent {
  const summary: VisualEvent = { ...(event.id ? { id: event.id } : {}), type: event.type };
  if (event.type === 'agent.message' || event.type === 'user.message') {
    summary.text = (event.content || []).filter((p: any) => p.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('\n').slice(0, 32000);
  }
  if (typeof event.name === 'string') summary.name = event.name.slice(0, 120);
  if (event.type === 'agent.tool_result') summary.isError = event.is_error === true;
  // Raw tool inputs/results may contain credentials, inline media and expiring download URLs.
  if (event.type === 'session.error') summary.text = '方舟执行遇到错误，请查看任务状态或重试。';
  return summary;
}

export function turnOutcome(event: ArkEvent, seenRunning: boolean): 'completed' | 'failed' | 'requires_action' | 'interrupted' | null {
  if (event.type === 'session.status_terminated') return 'failed';
  if (event.type === 'session.error' && event.error?.retry_status?.type === 'terminal') return 'failed';
  if (event.type !== 'session.status_idle' || !seenRunning) return null;
  const reason = event.stop_reason?.type;
  if (reason === 'requires_action') return 'requires_action';
  if (reason === 'retries_exhausted') return 'failed';
  if (reason === 'interrupted' || reason === 'user_interrupt') return 'interrupted';
  return !reason || reason === 'end_turn' ? 'completed' : 'failed';
}
