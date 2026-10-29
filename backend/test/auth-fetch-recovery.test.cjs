const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

for (const failure of ['network', 500, 403, 401]) {
  test(`refresh ${failure} clears login only on confirmed unauthorized`, async () => {
    let invalidations = 0;
    let calls = 0;
    const source = fs.readFileSync(require.resolve('../../frontend/src/services/authFetch.ts'), 'utf8')
      .replaceAll('import.meta.env', '({})');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    const dependencies = {
      triggerAuthInvalid: () => { invalidations++; },
      getAccessToken: () => 'permanent-token',
      getRefreshAuthHeader: () => ({}),
      setTokens: () => {},
      ensureTraceHeader: () => {},
      getBillingTeamId: () => null,
      notifyCreditsChanged: () => {},
    };
    vm.runInNewContext(compiled, {
      exports, require: () => dependencies, Headers, Response, Request, URL,
      fetch: async () => {
        if (++calls === 1) return new Response(null, { status: 401 });
        if (failure === 'network') throw new Error('offline');
        return new Response(null, { status: failure });
      },
    });
    await exports.fetchWithAuth('/api/projects');
    assert.equal(invalidations, failure === 401 ? 1 : 0);
  });
}

for (const method of ['me', 'meDetailed']) {
  for (const failure of ['network', 500, 403, 401]) {
    test(`${method} preserves stored credentials on refresh ${failure} unless unauthorized`, async () => {
      const user = { id: 'user', email: 'user@example.com' };
      const storage = new Map([['mock_user', JSON.stringify(user)]]);
      let cleared = false;
      let calls = 0;
      const source = fs.readFileSync(require.resolve('../../frontend/src/services/authApi.ts'), 'utf8')
        .replaceAll('import.meta.env', '({})');
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const exports = {};
      const dependencies = {
        clearTokens: () => { cleared = true; },
        getAccessAuthHeader: () => ({}), getRefreshAuthHeader: () => ({}),
        fetchWithAuth: async () => {
          if (++calls === 1) return new Response(null, { status: 401 });
          if (failure === 'network') throw new Error('offline');
          return new Response(null, { status: failure });
        },
      };
      vm.runInNewContext(compiled, {
        exports, require: () => dependencies,
        console: { warn: () => {} },
        localStorage: { getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key) },
      });
      const result = await exports.authApi[method]();
      assert.equal(cleared, failure === 401);
      const actualUser = method === 'me' ? result : result.user;
      assert.equal(actualUser?.id ?? null, failure === 401 ? null : 'user');
      assert.equal(storage.has('mock_user'), failure !== 401);
    });
  }
}
