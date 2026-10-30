const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadFrontend(file, dependencies, globals = {}) {
  const source = fs.readFileSync(require.resolve(`../../frontend/src/services/${file}.ts`), 'utf8').replaceAll('import.meta.env', '({})');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => dependencies, Headers, Response, Request, URL, AbortController, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} }, ...globals });
  return exports;
}

for (const meStatus of [200, 403, 500, 'network', 401]) {
  test(`business 401 and refresh rejection only logs out when auth/me confirms 401 (${meStatus})`, async () => {
    let invalidations = 0;
    const api = loadFrontend('authFetch', {
      getAccessToken: () => 'permanent', getRefreshAuthHeader: () => ({}), getAuthSessionSignature: () => 'session',
      triggerAuthInvalid: () => invalidations++, ensureTraceHeader() {}, getBillingTeamId: () => null,
    }, { fetch: async url => {
      if (String(url).endsWith('/auth/me')) {
        if (meStatus === 'network') throw Error('offline');
        return new Response(null, { status: meStatus });
      }
      return new Response(null, { status: 401 });
    } });
    await api.fetchWithAuth('/api/ai/generate-image');
    assert.equal(invalidations, meStatus === 401 ? 1 : 0);
  });
}
test('refresh retries a request with its newly issued token instead of its original explicit header', async () => {
  let token = 'old';
  const requests = [];
  const api = loadFrontend('authFetch', {
    getAccessToken: () => token, getRefreshAuthHeader: () => ({}), getAuthSessionSignature: () => token,
    setTokens: pair => { token = pair.accessToken; }, triggerAuthInvalid: () => assert.fail('unexpected logout'),
    ensureTraceHeader() {}, getBillingTeamId: () => null, notifyCreditsChanged() {},
  }, { fetch: async (url, init) => {
    if (String(url).endsWith('/auth/refresh')) return Response.json({ tokens: { accessToken: 'new' } });
    requests.push(new Headers(init.headers).get('Authorization'));
    return new Response(null, { status: requests.length === 1 ? 401 : 200 });
  } });
  assert.equal((await api.fetchWithAuth('/api/projects', { headers: { Authorization: 'Bearer old' } })).status, 200);
  assert.deepEqual(requests, ['Bearer old', 'Bearer new']);
});
test('an old refresh response cannot overwrite a new login', async () => {
  let signature = 'old-session';
  let invalidations = 0;
  let writes = 0;
  const api = loadFrontend('authFetch', {
    getAccessToken: () => signature, getAuthSessionSignature: () => signature, getRefreshAuthHeader: () => ({}),
    setTokens: () => writes++, triggerAuthInvalid: () => invalidations++, ensureTraceHeader() {}, getBillingTeamId: () => null,
  }, { fetch: async url => {
    if (String(url).endsWith('/auth/refresh')) {
      signature = 'new-login';
      return Response.json({ tokens: { accessToken: 'stale-response' } });
    }
    return new Response(null, { status: 401 });
  } });
  await api.fetchWithAuth('/api/projects');
  assert.equal(writes, 0);
  assert.equal(invalidations, 0);
});
test('AI image permission rejection does not independently refresh or force logout', async () => {
  let calls = 0;
  let invalidations = 0;
  const api = loadFrontend('aiImageService', {
    fetchWithAuth: async () => { calls++; return Response.json({ message: 'permission denied' }, { status: 403 }); },
    getRefreshAuthHeader: () => ({}), triggerAuthInvalid: () => invalidations++,
  });
  const result = await api.aiImageService.callAPI('/api/ai/generate-image', {}, 'test');
  assert.equal(result.success, false);
  assert.equal(calls, 1);
  assert.equal(invalidations, 0);
});

test('a business 401 after a successful refresh still requires auth/me confirmation', async () => {
  const api = loadFrontend('authFetch', {
    getAccessToken: () => 'permanent', getAuthSessionSignature: () => 'session', getRefreshAuthHeader: () => ({}),
    setTokens() {}, triggerAuthInvalid: () => assert.fail('business failure logged out user'),
    ensureTraceHeader() {}, getBillingTeamId: () => null,
  }, { fetch: async url => {
    if (String(url).endsWith('/auth/refresh')) return Response.json({ tokens: { accessToken: 'permanent' } });
    if (String(url).endsWith('/auth/me')) return Response.json({ user: { id: 'user' } });
    return new Response(null, { status: 401 });
  } });
  assert.equal((await api.fetchWithAuth('/api/ai/generate-image')).status, 401);
});

for (const method of ['me', 'meDetailed']) {
  test(`${method}: auth/me 403 never becomes a forced logout via refresh rejection`, async () => {
    let calls = 0;
    const api = loadFrontend('authApi', {
      getAuthSessionSignature: () => 'session', getAccessAuthHeader: () => ({}), getRefreshAuthHeader: () => ({}),
      clearTokens: () => assert.fail('403 cleared credentials'),
      fetchWithAuth: async () => { calls++; return new Response(null, { status: calls === 1 ? 403 : 401 }); },
    }, { localStorage: { getItem: () => JSON.stringify({ id: 'user' }), removeItem: () => assert.fail('403 removed user') } });
    const result = await api.authApi[method]();
    assert.equal((method === 'me' ? result : result.user).id, 'user');
    assert.equal(calls, 1);
  });
  test(`${method}: delayed initialization cannot clear credentials from a newer login`, async () => {
    let session = 'old';
    const storage = new Map([['mock_user', JSON.stringify({ id: 'old-user' })]]);
    const api = loadFrontend('authApi', {
      getAuthSessionSignature: () => session,
      getAccessAuthHeader: () => ({}), getRefreshAuthHeader: () => ({}),
      clearTokens: () => assert.fail('new credentials cleared'),
      fetchWithAuth: async () => {
        session = 'new';
        storage.set('mock_user', JSON.stringify({ id: 'new-user' }));
        return new Response(null, { status: 401 });
      },
    }, { localStorage: { getItem: key => storage.get(key), removeItem: () => assert.fail('new user removed') } });
    const result = await api.authApi[method]();
    assert.equal((method === 'me' ? result : result.user).id, 'new-user');
  });
}
