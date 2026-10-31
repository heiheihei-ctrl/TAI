require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGptImage25Model, isGptImage25Model } = require('../src/ai/services/gpt-image-25-model');
test('both retired models migrate without changing unrelated models', () => {
  for (const variant of ['sunburst', 'flare']) {
    const official = `gpt-image-2.5-${variant}-official`;
    assert.equal(normalizeGptImage25Model(`gpt-image-2.5-${variant}-vip`), official);
    assert.equal(normalizeGptImage25Model(official), official);
    assert.equal(isGptImage25Model(official), true);
    assert.equal(isGptImage25Model(`gpt-image-2.5-${variant}-vip`), true);
  }
  assert.equal(normalizeGptImage25Model('gpt-image-2-official'), 'gpt-image-2-official');
  assert.equal(isGptImage25Model('gpt-image-2-official'), false);
});

test('outbound requests normalize both aliases and accept synchronous official results', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const ts = require('typescript');
  const source = fs.readFileSync(require.resolve('../src/ai/services/nano2.service.ts'), 'utf8');
  const exports = {};
  const sent = [];
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true, emitDecoratorMetadata: false } }).outputText;
  vm.runInNewContext(code, { exports, setTimeout, require: name => {
    if (name.includes('apimartHttpClient')) return {
      apimartRequest: async req => { sent.push(req.data); return { status: 200, data: { data: [{ url: 'https://example.com/result.png' }] } }; },
      buildToapisUrl: p => 'https://example.com'+p, getToapisApiKey: () => 'test', getApimartProxySummary: () => '',
    };
    if (name === './gpt-image-25-model') return { normalizeGptImage25Model, isGptImage25Model };
    if (name.includes('toapisHttpClient')) return { getToapisApiBaseUrl: () => 'https://example.com' };
    if (name.includes('upstreamImageTask.util')) return {
      extractUpstreamImageTaskId: () => '', extractUpstreamImageUrl: d => d.data[0].url,
    };
    if (name.includes('upstream-image-url.service')) return {};
    return require(name);
  }});
  const service = new exports.Nano2Service({ get: () => undefined }, {});
  service.logger = { log() {}, warn() {}, error() {} };
  for (const variant of ['sunburst', 'flare']) {
    for (const suffix of ['vip', 'official']) {
      const result = await service.generateImage({ model: `gpt-image-2.5-${variant}-${suffix}`, prompt: 'test' });
      assert.equal(sent.at(-1).model, `gpt-image-2.5-${variant}-official`);
      assert.equal(result.imageUrl, 'https://example.com/result.png');
      assert.equal(result.status, 'completed');
    }
  }
});
