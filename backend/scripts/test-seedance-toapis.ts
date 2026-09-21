import { strict as assert } from 'node:assert';
import axios from 'axios';
import { VideoProviderService } from '../src/ai/services/video-provider.service';
import { ModelRoutingService } from '../src/ai/services/model-routing.service';

async function main() {
  const originalRequest = axios.request;
  const originalEnv = { ...process.env };
  try {
    process.env.TOAPIS_TOKEN = 'test-seedance-token';
    process.env.TOAPIS_API_BASE_URL = 'https://toapis.cn/v1';
    const service = Object.create(VideoProviderService.prototype) as any;
    service.logger = { log() {}, warn() {}, error() {}, debug() {} };
    service.logProviderPayload = () => {};
    const options = { seedanceModel: 'seedance-2.0', prompt: 'product video', duration: 6,
      aspectRatio: '16:9', resolution: '720P', generateAudio: true };
    const calls: any[] = [];
    let status = 200;
    let data: any = { id: 'task/test' };
    axios.request = (async (request: any) => {
      calls.push(request);
      return { status, data };
    }) as any;
    const route = { vendor: { vendorKey: 'toapis', platformKey: 'toapis' } };
    const result = await service.generateSeedance25ViaToapis(options, route);
    assert.deepEqual(calls[0].data, { model: 'seedance-2', prompt: 'product video', duration: 6,
      size: '16:9', aspect_ratio: '16:9', resolution: '720p', metadata: {}, generate_audio: true });
    assert.equal(calls[0].url, 'https://toapis.cn/v1/videos/generations');
    assert.equal(calls[0].headers.Authorization, 'Bearer test-seedance-token');
    assert.equal(result.taskId, 'seedance20-toapis:task/test');
    assert.equal(result.execution.modelKey, 'seedance-2.0');
    data = { status: 'processing' };
    await service.querySeedance25ToapisTask(result.taskId);
    assert.match(calls[1].url, /\/videos\/generations\/task%2Ftest\?/);
    data = { id: 'task25' };
    const old = await service.generateSeedance25ViaToapis({ ...options, seedanceModel: 'seedance-2.5' }, route);
    assert.equal(calls[2].data.model, 'seedance-2-5');
    assert.equal(calls[2].data.duration, 5);
    assert.equal(calls[2].data.output_format, 'mp4');
    assert.equal(old.execution.modelKey, 'seedance-2.5');
    status = 400;
    data = { error: { message: 'The API key status is not active' } };
    await assert.rejects(service.generateSeedance25ViaToapis(options, route), /TOAPIS_TOKEN/);
    const routing = new ModelRoutingService({ systemSetting: { findUnique: async () => ({
      value: JSON.stringify({ models: [{ modelKey: 'seedance-2.0', defaultVendor: 'toapis', vendors: [] }] }),
    }) } } as any);
    const config = await routing.getParsedConfig();
    const model = config.models?.find((item) => item.modelKey === 'seedance-2.0');
    assert.equal(model?.defaultVendor, 'toapis');
    assert.equal(model?.vendors?.find((item) => item.vendorKey === 'toapis')?.modelVersion, '2.0');
    // 显式 TAI 路线优先于部署默认品牌，且不能跨渠道兜底。
    process.env.DEPLOYMENT_BRAND = 'linglong';
    service.apiKeys = { doubao: 'test-official-key' };
    service.withExecutionMetadata = (result: any) => result;
    service.generateSeedanceViaTianyi = async () => ({ taskId: 'tianyi:test' });
    service.generateSeedance25ViaToapis = async () => ({ taskId: 'toapis:test' });
    service.generateDoubao = async () => ({ taskId: 'official:test' });
    service.modelRoutingService = { resolveVideoModelCandidates: async () => [
      { vendor: { vendorKey: 'seedance_api' }, route: 'legacy' },
      { vendor: { vendorKey: 'toapis' }, route: 'legacy' },
    ] };
    for (const seedanceModel of ['seedance-2.0', 'seedance-2.5']) {
      assert.equal((await service.generateManagedSeedance({ ...options, seedanceModel, vendorKey: 'toapis' })).taskId, 'toapis:test');
      assert.equal((await service.generateManagedSeedance({ ...options, seedanceModel, vendorKey: 'seedance_api' })).taskId, 'official:test');
    }
    assert.equal((await service.generateManagedSeedance({ ...options, vendorKey: 'tianyi' })).taskId, 'tianyi:test');
    // TAI 部署下即使残留 vendorKey=tianyi 也不得走天翼
    process.env.DEPLOYMENT_BRAND = 'tai';
    assert.equal((await service.generateManagedSeedance({ ...options, vendorKey: 'tianyi' })).taskId, 'official:test');
    process.env.DEPLOYMENT_BRAND = 'linglong';
    service.modelRoutingService.resolveVideoModelCandidates = async () => [
      { vendor: { vendorKey: 'seedance_api' }, route: 'legacy' },
    ];
    await assert.rejects(service.generateManagedSeedance({ ...options, vendorKey: 'toapis' }), /可用生成链路/);
    console.log('Seedance ToAPIs payload, polling, identity routing and strict channel checks passed');
  } finally {
    axios.request = originalRequest;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });