require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VideoProviderService } = require('../src/ai/services/video-provider.service');

test('Seedance uses configured credentials, supports ARK_API_KEY and never uses a built-in key', () => {
  const oldDoubao = process.env.DOUBAO_API_KEY;
  const oldArk = process.env.ARK_API_KEY;
  try {
    for (const [doubao, ark, expected] of [
      ['current-doubao', 'current-ark', 'current-doubao'],
      ['', 'current-ark', 'current-ark'],
      ['  ', ' current-ark ', 'current-ark'],
      ['', '', ''],
    ]) {
      process.env.DOUBAO_API_KEY = doubao;
      process.env.ARK_API_KEY = ark;
      const service = new VideoProviderService({}, {}, {}, {}, {});
      assert.equal(service.apiKeys.doubao, expected);
    }
  } finally {
    if (oldDoubao === undefined) delete process.env.DOUBAO_API_KEY;
    else process.env.DOUBAO_API_KEY = oldDoubao;
    if (oldArk === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = oldArk;
  }
});
