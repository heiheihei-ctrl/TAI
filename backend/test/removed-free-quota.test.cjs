require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CreditsService } = require('../src/credits/credits.service');

test('retired free image/video quota checks do not query or reject users', async () => {
  const service = Object.create(CreditsService.prototype);
  service.prisma = new Proxy({}, { get() { throw new Error('Retired quota must not access database'); } });
  for (const type of ['image-generation', 'doubao-video']) {
    await service.assertFreeUserUsageQuota('user', type, 1000);
    await service.assertFreeUserImageQuota('user', type, 1000);
  }
});

test('both billing paths retain balance checks but never enforce retired usage quotas', () => {
  for (const name of ['preDeductCredits', 'preDeductTeamCredits']) {
    const body = CreditsService.prototype[name].toString();
    assert.doesNotMatch(body, /enforceFreeUser|shouldSkipFreeUsageQuota/);
    assert.match(body, /sufficient|balance/);
    assert.match(body, /\$transaction/);
  }
});
