import { BadRequestException } from '@nestjs/common';
import type { VideoProviderRequestDto } from '../dto/video-provider.dto';

// ToAPIs Seedance generation contract, reviewed 2026-10-30.
export function buildSeedanceToapisPayload(
  options: VideoProviderRequestDto,
  version: '2.0' | '2.0-fast' | '2.5',
): Record<string, any> {
  const is25 = version === '2.5';
  const duration = options.duration ?? 5;
  const maxDuration = is25 ? 30 : 15;
  // Automatic duration is deliberately not exposed: prepaid billing requires a fixed duration.
  if (!Number.isInteger(duration) || duration < 4 || duration > maxDuration) {
    throw new BadRequestException(`ToAPIs Seedance ${version} 时长必须为 4-${maxDuration} 秒的整数，暂不支持自动时长`);
  }
  const resolution = String(options.resolution || '720p').trim().toLowerCase();
  const resolutions = version === '2.0-fast' ? ['480p', '720p']
    : is25 ? ['480p', '720p', '1080p'] : ['480p', '720p', '1080p', '4k'];
  if (!resolutions.includes(resolution)) {
    throw new BadRequestException(`ToAPIs Seedance ${version} 不支持分辨率 ${resolution}`);
  }
  let ratio = String(options.aspectRatio || '16:9').trim().toLowerCase();
  if (ratio === 'auto') ratio = 'adaptive';
  if (!['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(ratio)) {
    throw new BadRequestException(`ToAPIs Seedance 不支持尺寸 ${ratio}`);
  }
  const normalizeUrls = (values: unknown[], label: string): string[] => values.map(value => {
    const url = typeof value === 'string' ? value.trim()
      : value && typeof value === 'object' && 'url' in value ? String(value.url || '').trim() : '';
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new BadRequestException(`${label}必须使用公网 HTTP(S) URL`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || Buffer.byteLength(url) > 2048) {
      throw new BadRequestException(`${label}必须使用无账号密码且不超过 2048 字节的公网 HTTP(S) URL`);
    }
    return url;
  });
  const images = normalizeUrls(options.referenceImages || [], '参考图片');
  const videos = normalizeUrls(options.referenceVideos?.length ? options.referenceVideos
    : options.referenceVideo ? [options.referenceVideo] : [], '参考视频');
  const audios = normalizeUrls(options.audioUrls || [], '参考音频');
  if (images.length > (is25 ? 30 : 9) || videos.length > (is25 ? 10 : 3) || audios.length > (is25 ? 10 : 3)) {
    throw new BadRequestException(`ToAPIs Seedance ${version} 参考素材数量超限`);
  }
  const typeByUrl = new Map<string, string>();
  for (const [type, values] of [['image', images], ['video', videos], ['audio', audios]] as const) {
    for (const url of values) {
      if (typeByUrl.has(url) && typeByUrl.get(url) !== type) throw new BadRequestException('同一 URL 不能用于不同类型的参考素材');
      typeByUrl.set(url, type);
    }
  }
  const mode = String(options.videoMode || '').trim().toLowerCase();
  const frameMode = ['start_end', 'start-end2video', 'first_frame', 'img2video', 'image'].includes(mode);
  const useReference = !frameMode && (mode === 'reference_images' || images.length > 1 || videos.length > 0 || audios.length > 0);
  if (frameMode && (videos.length || audios.length)) {
    throw new BadRequestException('首帧/首尾帧不能与参考视频或音频模式混用');
  }
  const maxFrames = ['first_frame', 'img2video', 'image'].includes(mode) ? 1 : 2;
  if (!useReference && images.length > maxFrames) throw new BadRequestException('首尾帧最多两张图，首帧模式只能一张图');
  if (!is25 && audios.length && !images.length && !videos.length) {
    throw new BadRequestException('Seedance 2.0 参考音频至少需要一张图片或一个视频');
  }
  const prompt = String(options.prompt || '').trim();
  if (!prompt && !images.length && !videos.length && !audios.length) throw new BadRequestException('请提供提示词或参考素材');
  if (is25 && images.length && !useReference) ratio = 'adaptive';
  const payload: Record<string, any> = {
    model: is25 ? 'seedance-2-5' : version === '2.0-fast' ? 'seedance-2-fast' : 'seedance-2',
    prompt, duration, size: ratio, aspect_ratio: ratio, resolution, metadata: {},
    generate_audio: options.generateAudio ?? true,
    ...(is25 ? { video_operation: 'generate', output_format: 'mp4' } : {}),
  };
  if (images.length) payload.image_with_roles = images.map((url, index) => ({
    url, role: useReference ? 'reference_image' : index === 0 ? 'first_frame' : 'last_frame',
  }));
  if (videos.length) payload.video_with_roles = videos.map(url => ({ url, role: 'reference_video' }));
  if (audios.length) payload.audio_with_roles = audios.map(url => ({ url, role: 'reference_audio' }));
  // Retain the verified explicit review flag for existing integrations; current docs also review automatically.
  if (images.length || videos.length || audios.length) payload.private_asset_review = true;
  return payload;
}
