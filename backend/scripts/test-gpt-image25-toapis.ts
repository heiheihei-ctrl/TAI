import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { Nano2Provider } from '../src/ai/providers/nano2.provider';
import { Nano2Service } from '../src/ai/services/nano2.service';
import { ImageTaskService } from '../src/ai/services/image-task.service';
import * as http from '../src/utils/apimartHttpClient';

async function main() {
  const originalRequest = http.apimartRequest;
  const originalToken = process.env.TOAPIS_TOKEN;
  process.env.TOAPIS_TOKEN = 'test-token';
  let payload: any;
  let queries = 0;
  let direct = false;
  (http as any).apimartRequest = async (options: any) => {
    if (options.method === 'POST') {
      payload = options.data;
      return { status: 200, data: direct ? { data: [{ url: 'https://example.com/direct.png' }] } : { data: [{ task_id: 'test-task', status: 'queued' }] } };
    }
    queries++;
    return { status: 200, data: { status: 'completed', result: { images: [{ url: 'https://example.com/result.png' }] } } };
  };
  try {
    const config = new ConfigService({ NANO2_POLL_INITIAL_DELAY_MS: '1', NANO2_POLL_INTERVAL_MS: '1' });
    const service = new Nano2Service(config, { resolveHttpUrls: async (urls: string[]) => urls } as any);
    const provider = new Nano2Provider(config, service, {} as any);
    const request = { model: 'gpt-image-2.5-sunburst-vip', prompt: '产品广告', providerOptions: { banana: { imageRoute: 'stable' } } };
    const result = await provider.generateImage(request);
    assert.equal(result.success, true);
    assert.equal(queries, 1);
    assert.deepEqual(payload, { model: request.model, prompt: request.prompt, size: '1:1', n: 1, metadata: { resolution: '1K', orientation: 'square' }, quality: 'high' });
    direct = true;
    for (const quality of ['low', 'medium', 'high', 'xhigh', 'max']) {
      await provider.generateImage({ ...request, quality });
      assert.equal(payload.quality, quality, `Must preserve ${quality} upstream`);
    }
    const directResult = await provider.generateImage({ ...request, aspectRatio: '9:16', imageSize: '2K', quality: 'medium' });
    assert.equal(directResult.data.imageUrl, 'https://example.com/direct.png');
    assert.equal(queries, 1);
    assert.deepEqual(payload.metadata, { resolution: '2K', orientation: 'portrait' });
    assert.equal(payload.quality, 'medium');
    await provider.generateImage({ ...request, aspectRatio: '16:9', imageSize: '4K' });
    assert.deepEqual(payload.metadata, { resolution: '4K', orientation: 'landscape' });
    const effectiveProvider = (ImageTaskService.prototype as any).resolveEffectiveProviderName.call({}, { aiProvider: 'banana' }, request);
    assert.equal(effectiveProvider, 'nano2');
    direct = false;
    await provider.generateImage({ model: 'gpt-image-2-official', prompt: 'existing' });
    assert.equal(payload.model, 'gpt-image-2-official');
    assert.equal((payload as any).resolution, '1k');
    assert.equal(payload.metadata, undefined);
    assert.equal(payload.quality, 'medium');
    console.log('PASS: GPT Image 2.5 payload, routing, polling, direct URL, orientations and 2.0 compatibility');
  } finally {
    (http as any).apimartRequest = originalRequest;
    if (originalToken === undefined) delete process.env.TOAPIS_TOKEN;
    else process.env.TOAPIS_TOKEN = originalToken;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });