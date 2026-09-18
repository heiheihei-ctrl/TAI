import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';
import { VideoProviderService } from '../src/ai/services/video-provider.service';

// Load the dependency-free frontend helper across the ESM/CJS package boundary.
const source = readFileSync(resolve(__dirname, '../../frontend/src/utils/apiUsageChannel.ts'), 'utf8');
const context = { exports: {} as { getRecordChannelLabel: (record: unknown) => string } };
runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, context);
const { getRecordChannelLabel } = context.exports;

for (const [params, expected] of [
  [{ channel: 'Apimart' }, 'ToAPIs'],
  [{ vendorKey: 'seedance_api' }, 'Tencent'],
  [{ providerChannel: 'tencent_vod' }, 'Tencent'],
  [{ executionChannel: 'toapis', channel: 'tencent' }, 'ToAPIs'],
  [{ providerChannel: 'toapis', vendorKey: 'seedance_api' }, 'ToAPIs'],
  [{ taskId: 'seedance20-toapis:123', providerChannel: 'seedance_api' }, 'ToAPIs'],
  [{ bananaImageRoute: 'normal', vendorKey: 'seedance_api' }, 'ToAPIs'],
  [{ bananaImageRoute: 'stable' }, 'Tencent'],
  [{ channel: 'unknown' }, '-'],
] as const) {
  assert.equal(getRecordChannelLabel({ requestParams: params }), expected);
}
assert.equal(getRecordChannelLabel({ provider: 'gemini' }), '-');

const service = Object.create(VideoProviderService.prototype) as any;
const result = service.withExecutionMetadata({
  taskId: 'seedance20-toapis:123', execution: { providerChannel: 'toapis' },
}, {
  model: { modelKey: 'seedance-2.0' },
  vendor: { vendorKey: 'seedance_api' }, route: 'legacy',
}, false);
assert.equal(result.execution.providerChannel, 'toapis');
assert.equal(result.execution.vendorKey, 'seedance_api');
assert.equal(result.execution.fallbackUsed, false);
console.log('API usage route groups and execution metadata checks passed');