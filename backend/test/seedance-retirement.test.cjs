require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VideoProviderService } = require('../src/ai/services/video-provider.service');
const { ModelRoutingService } = require('../src/ai/services/model-routing.service');
const { NodeConfigService } = require('../src/admin/services/node-config.service');
const { AiController } = require('../src/ai/ai.controller');

test('retired Seedance requests are refused before any upstream generation', async () => {
  const service = Object.create(VideoProviderService.prototype);
  for (const seedanceModel of ['seedance-1.5-pro', 'seedance-1.5', '1.5-pro', '1.5']) {
    await assert.rejects(service.generateVideo({ provider: 'doubao', seedanceModel }), /1.5.*下线/);
  }
});
test('the HTTP controller refuses retired models before user lookup and credit deduction', async () => {
  const controller = Object.create(AiController.prototype);
  await assert.rejects(controller.generateVideoProvider({ provider: 'doubao', seedanceModel: 'seedance-1.5-pro' }, {}), /1.5.*下线/);
});
test('default and persisted routing catalogs do not expose Seedance 1.5', async () => {
  const service = new ModelRoutingService({ systemSetting: { findUnique: async () => ({
    value: JSON.stringify({ models: [{ modelKey: 'seedance-1.5', enabled: true, vendors: [] }] }),
  }) } });
  for (const config of [service.getDefaultConfig(), await service.getParsedConfig()]) {
    assert.equal(config.models.some(model => model.modelKey === 'seedance-1.5'), false);
  }
});
test('legacy node configuration returns current Seedance model metadata', () => {
  const service = Object.create(NodeConfigService.prototype);
  const row = service.normalizeNodeConfigOutput({ nodeKey: 'doubaoVideo', nameZh: 'Seedance 1.5 Pro', metadata: {} });
  assert.equal(JSON.stringify(row).includes('1.5'), false);
  assert.ok(JSON.stringify(row).includes('seedance-2.5'));
});

test('historical V2 tasks remain queryable without restoring the retired routing catalog', async () => {
  const service = Object.create(VideoProviderService.prototype);
  service.managedV2TaskPrefix = 'managed-v2:';
  service.getProviderApiKey = () => 'test-key';
  service.queryDoubao = async id => ({ status: 'processing', id });
  service.queryTencentManagedVideoTask = async id => ({ status: 'processing', id });
  for (const vendor of ['seedance_api', 'tencent_vod']) {
    const id = service.buildManagedV2TaskId('seedance-1.5', vendor, 'old-task');
    assert.equal((await service.queryManagedV2Task(id)).id, 'old-task');
  }
});
