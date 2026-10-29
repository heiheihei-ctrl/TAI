require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JwtService } = require('@nestjs/jwt');
const { ConfigService } = require('@nestjs/config');
const bcrypt = require('bcryptjs');
const { AuthService } = require('../src/auth/auth.service');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { RefreshJwtStrategy } = require('../src/auth/strategies/refresh.strategy');

test('login issues signed credentials without an expiration and persists no expiry', async () => {
  const jwt = new JwtService();
  let record;
  const prisma = {
    refreshToken: { create: async ({ data }) => { record = data; } },
    user: { update: async () => ({ id: 'user' }) },
  };
  const service = new AuthService({}, prisma, jwt, { get: () => undefined }, {}, {}, {}, {});
  const tokens = await service.login({ id: 'user', email: 'user@example.com', role: 'user' });
  for (const [key, secret] of [['accessToken', 'dev-access-secret'], ['refreshToken', 'dev-refresh-secret']]) {
    const payload = await jwt.verifyAsync(tokens[key], { secret, clockTimestamp: 4102444800 });
    assert.equal(payload.sub, 'user');
    assert.equal(payload.exp, undefined);
  }
  assert.equal('expiresAt' in record, false);
  assert.equal(await bcrypt.compare(tokens.refreshToken, record.tokenHash), true);
});

test('historical refresh records are accepted independently of their age', async () => {
  const token = 'legacy-refresh';
  const record = { id: 'record', tokenHash: await bcrypt.hash(token, 10), createdAt: new Date(0), expiresAt: new Date(0) };
  const writes = [];
  const prisma = {
    refreshToken: {
      findMany: async () => [record],
      update: async (args) => { writes.push(args); },
      create: async ({ data }) => { assert.equal('expiresAt' in data, false); },
    },
    user: { update: async () => ({ id: 'user' }) },
  };
  const service = new AuthService({}, prisma, new JwtService(), new ConfigService(), {}, {}, {}, {});
  const tokens = await service.refresh({ sub: 'user', email: '', role: 'user' }, token);
  assert.ok(tokens.accessToken);
  assert.equal(tokens.refreshToken, token);
  assert.deepEqual(writes, []);
  await assert.rejects(service.refresh({ sub: 'user' }, 'invalid'), /刷新令牌无效/);
});

test('refresh accepts an older device credential without revoking it', async () => {
  const oldToken = 'older-device';
  const records = [
    { id: 'new', tokenHash: await bcrypt.hash('newer-device', 4) },
    { id: 'old', tokenHash: await bcrypt.hash(oldToken, 4) },
  ];
  const prisma = {
    refreshToken: { findMany: async () => records },
    user: { update: async () => ({ id: 'user' }) },
  };
  const service = new AuthService({}, prisma, new JwtService(), new ConfigService(), {}, {}, {}, {});
  for (let i = 0; i < 2; i++) {
    const tokens = await service.refresh({ sub: 'user', email: '', role: 'user' }, oldToken);
    assert.equal(tokens.refreshToken, oldToken);
  }
});

for (const Strategy of [JwtStrategy, RefreshJwtStrategy]) {
  test(`${Strategy.name} uses the explicit bearer credential ahead of stale cookies`, async () => {
    const strategy = new Strategy(new ConfigService(), {
      findAuthUserById: async () => ({ id: 'user' }),
      getSessionsInvalidatedAt: async () => null,
    });
    const req = { headers: { authorization: 'Bearer current' }, cookies: { access_token: 'old-access', refresh_token: 'old-refresh' } };
    assert.equal(strategy._jwtFromRequest(req), 'current');
    if (Strategy === RefreshJwtStrategy) {
      assert.equal((await strategy.validate(req, { sub: 'user' })).refreshToken, 'current');
    }
    req.headers = {};
    assert.equal(strategy._jwtFromRequest(req), Strategy === JwtStrategy ? 'old-access' : 'old-refresh');
  });
}

for (const Strategy of [JwtStrategy, RefreshJwtStrategy]) {
  test(`${Strategy.name} accepts old signed JWTs but preserves forced logout`, async () => {
    let invalidatedAt = null;
    const users = {
      findAuthUserById: async () => ({ id: 'user', role: 'user', status: 'active' }),
      getSessionsInvalidatedAt: async () => invalidatedAt,
      touchLastLoginAt: async () => {},
    };
    const strategy = new Strategy(new ConfigService(), users);
    assert.equal(strategy._verifOpts.ignoreExpiration, true);
    const req = { headers: {} };
    const payload = { sub: 'user', iat: 1, exp: 2 };
    const validate = () => Strategy === JwtStrategy ? strategy.validate(payload) : strategy.validate(req, payload);
    await validate();
    invalidatedAt = new Date();
    await assert.rejects(validate(), /登录已失效/);
  });
}
