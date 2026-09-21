import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProxyLogger } from './viteProxyLogger.ts';

function setup() {
  const errors = [];
  const warnings = [];
  const logger = createProxyLogger({
    error: (...args) => errors.push(args),
    warn: (...args) => warnings.push(args),
  });
  return { logger, errors, warnings };
}

for (const code of ['ECONNABORTED', 'ECONNRESET', 'EPIPE']) {
  test(`downstream ${code} becomes a concise warning`, () => {
    const { logger, errors, warnings } = setup();
    logger.error('\u001b[31mws proxy socket error:\u001b[39m\nstack', {
      error: Object.assign(new Error('write failed'), { code }),
    });
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0][0].includes(code));
    assert.ok(!warnings[0][0].includes('stack'));
  });
}

for (const [message, code] of [
  ['ws proxy error:', 'ECONNABORTED'],
  ['http proxy error: /api', 'ECONNRESET'],
  ['ws proxy socket error:', 'ECONNREFUSED'],
  ['ws proxy socket error:', 'ETIMEDOUT'],
  ['ws proxy socket error:', undefined],
  ['build failed', 'EPIPE'],
]) {
  test(`preserves ${message} (${code})`, () => {
    const { logger, errors, warnings } = setup();
    const options = { error: Object.assign(new Error('failure'), { code }) };
    logger.error(message, options);
    assert.deepEqual(errors, [[message, options]]);
    assert.equal(warnings.length, 0);
  });
}

test('preserves errors without metadata', () => {
  const { logger, errors, warnings } = setup();
  logger.error('ws proxy socket error:');
  assert.deepEqual(errors, [['ws proxy socket error:', undefined]]);
  assert.equal(warnings.length, 0);
});