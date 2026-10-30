const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('a changed quote never displays the previous model price while awaiting its response', async () => {
  const states = [], effects = [], timers = [], requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    },
    useMemo: fn => fn(),
    useEffect: fn => effects.push(fn),
  };
  const exports = {};
  const source = fs.readFileSync(require.resolve('../../frontend/src/components/flow/hooks/useBackendCreditsPreview.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : {
    buildPreviewRequestSignature: JSON.stringify,
    previewCredits: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  }, window: { setTimeout: fn => timers.push(fn), clearTimeout() {} } });
  const render = model => {
    cursor = 0;
    return exports.useBackendCreditsPreview({ serviceType: 'doubao-video', model });
  };
  render('seedance-1.5'); effects.shift()(); timers.shift()();
  requests.shift().resolve({ credits: 120 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render('seedance-1.5').credits, 120);
  effects.length = 0;
  assert.equal(render('seedance-2.5').credits, undefined);
  effects.shift()(); timers.shift()();
  requests.shift().resolve({ credits: 1200 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render('seedance-2.5').credits, 1200);
  effects.length = 0;
  assert.equal(render('seedance-2.0').credits, undefined);
  effects.shift()(); timers.shift()();
  requests.shift().reject(new Error('quote unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render('seedance-2.0').credits, undefined);
  assert.equal(render('seedance-2.0').failed, true);
});
