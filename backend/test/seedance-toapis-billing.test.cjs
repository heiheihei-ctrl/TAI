require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CreditsService } = require('../src/credits/credits.service');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const frontExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../../frontend/src/config/seedanceCapabilities.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: frontExports });
const { getSeedanceDurations } = frontExports;
const service = Object.create(CreditsService.prototype);
service.configService = { get: () => false };

for (const [model, duration, rate] of [['seedance-2.0', 6, 120], ['seedance-2.0-fast', 11, 96.6], ['seedance-2.5', 29, 240]]) {
  test(`${model} charges exactly the requested ToAPIs integer duration`, () => {
    const method = model === 'seedance-2.5' ? 'resolveSeedance25Credits' : 'resolveSeedance20Credits';
    const credits = service[method]('doubao-video', 1, { seedanceModel: model, vendorKey: 'toapis', duration, resolution: '720P' });
    assert.equal(credits, Math.round(duration * rate));
    assert.ok(getSeedanceDurations(model === 'seedance-2.5', true).includes(duration));
  });
}
test('ToAPIs 4 seconds stays 4 and official duration behavior is unchanged', () => {
  assert.equal(service.resolveSeedanceClipDurationSeconds({ vendorKey: 'toapis', duration: 4 }, 5, 15), 4);
  assert.equal(service.resolveSeedanceClipDurationSeconds({ vendorKey: 'seedance_api', duration: 6 }, 5, 15), 5);
  assert.deepEqual(Array.from(getSeedanceDurations(false, false)), [5, 10, 15]);
  assert.equal(getSeedanceDurations(true, true).at(-1), 30);
});

test('ToAPIs review and generation have a 45-minute polling window, other routes retain their limit', () => {
  for (const id of ['seedance20-toapis:task', 'seedance25-toapis:task']) {
    assert.equal(frontExports.getSeedancePollMaxAttempts(id, 180), 540);
  }
  assert.equal(frontExports.getSeedancePollMaxAttempts('official-task', 180), 180);
});
