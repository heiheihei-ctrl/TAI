import { strict as assert } from 'node:assert';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Seedream5Service } from '../src/ai/services/seedream5.service';
import { Seedream5ProProvider, SEEDREAM5_PRO_MODEL_ID } from '../src/ai/providers/seedream5-pro.provider';
import { RECHARGE_PACKAGES } from '../src/payment/dto/payment.dto';

async function main() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const originalRequest = axios.request;
  const originalTimeout = globalThis.setTimeout;
  try {
    process.env.DEPLOYMENT_BRAND = 'tai';
    process.env.TOAPIS_TOKEN = 'test-toapis';
    process.env.TOAPIS_API_BASE_URL = 'https://toapis.cn/v1';
    const values: Record<string, string> = { ARK_API_KEY: 'test-ark', WATCHA_API_KEY: 'test-watcha' };
    const config = { get: (key: string) => values[key] } as ConfigService;
    let settingsRead = 0;
    const prisma = { systemSetting: { findUnique: async () => { settingsRead++; return { value: 'watcha' }; } } };
    const tianyi = {
      isConfigured: () => true, getBaseUrl: () => 'https://ai.ctaigw.cn',
      getApiKey: () => 'test-tianyi', getSeedreamModel: () => 'tianyi-seedream',
      getSeedreamWatermark: () => false,
    };
    const service = new Seedream5Service(config, prisma as any, tianyi as any);
    const provider = new Seedream5ProProvider(config, service);
    const calls: any[] = [];
    let responses: any[] = [];
    axios.request = (async (request: any) => {
      calls.push(request);
      return { status: 200, statusText: 'OK', data: responses.shift() };
    }) as any;
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url, ...init });
      return new Response(JSON.stringify({ data: [{ url: 'https://example.com/official.png' }] }));
    }) as any;
    globalThis.setTimeout = ((callback: any, delay: number, ...args: any[]) =>
      originalTimeout(callback, delay === 2000 ? 0 : delay, ...args)) as any;

    responses = [{ id: 'task/test', status: 'queued' }, { status: 'completed', result: { data: [{ url: 'https://example.com/normal.png' }] } }];
    const normal = await provider.generateImage({ prompt: 'poster', imageSize: '1.5K', imageUrls: ['https://example.com/ref.png'], providerOptions: { banana: { imageRoute: 'normal' } } });
    assert.equal(normal.data.imageUrl, 'https://example.com/normal.png');
    assert.equal(normal.data.metadata.channel, 'toapis');
    assert.equal(calls[0].url, 'https://toapis.cn/v1/images/generations');
    assert.equal(calls[0].headers.Authorization, 'Bearer test-toapis');
    assert.equal(calls[0].data.model, 'doubao-seedream-5-0-pro');
    assert.equal(calls[0].data.resolution, '1.5K');
    assert.deepEqual(calls[0].data.image_urls, ['https://example.com/ref.png']);
    assert.equal(calls[1].url, 'https://toapis.cn/v1/images/generations/task%2Ftest');

    calls.length = 0;
    const stable = await provider.generateImage({ prompt: 'poster', providerOptions: { bananaImageRoute: 'stable' } });
    assert.equal(stable.data.metadata.channel, 'doubao');
    assert.equal(calls[0].url, 'https://ark.cn-beijing.volces.com/api/v3/images/generations');
    assert.equal(calls[0].headers.Authorization, 'Bearer test-ark');
    assert.equal(JSON.parse(calls[0].body).model, SEEDREAM5_PRO_MODEL_ID);
    assert.equal('sequential_image_generation' in JSON.parse(calls[0].body), false);
    assert.equal(settingsRead, 0);
    assert.equal((await service.getProviderExecutionInfo(SEEDREAM5_PRO_MODEL_ID)).provider, 'doubao');
    assert.equal((await service.getProviderExecutionInfo()).provider, 'watcha');

    responses = [{ id: 'failed-task', status: 'failed', error: { message: 'API key inactive' } }];
    await assert.rejects(provider.generateImage({ providerOptions: { bananaImageRoute: 'normal' } }), /API key inactive/);
    delete process.env.TOAPIS_TOKEN;
    await assert.rejects(service.getProviderExecutionInfo(SEEDREAM5_PRO_MODEL_ID, 'normal'), /TOAPIS_TOKEN/);
    process.env.DEPLOYMENT_BRAND = 'linglong';
    assert.equal((await service.getProviderExecutionInfo(SEEDREAM5_PRO_MODEL_ID, 'normal')).provider, 'tianyi');
    assert.equal(RECHARGE_PACKAGES.find((item) => item.price === 25)?.credits, 2500);
    assert.equal(RECHARGE_PACKAGES.find((item) => item.price === 50)?.credits, 5000);
    console.log('Seedream Pro routing, async results, failure handling and recharge checks passed');
  } finally {
    globalThis.fetch = originalFetch;
    axios.request = originalRequest;
    globalThis.setTimeout = originalTimeout;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });