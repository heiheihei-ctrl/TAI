require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ImageTaskService } = require('../src/ai/services/image-task.service');

test('status polling projects result metadata in SQL and retains the owner predicate', async () => {
  const service = Object.create(ImageTaskService.prototype);
  const result = { status: 'succeeded', imageUrl: 'https://example.com/a.png', requestData: {
    resultImageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
    resultMetadata: { count: 2 },
  } };
  service.prisma = {
    imageTask: { findFirst: () => { throw new Error('Full task row must not be fetched for polling'); } },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      assert.match(sql, /"userId"\s*=\s*\?/);
      assert.deepEqual(values, ['task-id', 'owner-id']);
      assert.match(sql, /"requestData"\s*->\s*'resultImageUrls'/);
      assert.match(sql, /"requestData"\s*->\s*'resultMetadata'/);
      assert.doesNotMatch(sql, /SELECT\s+\*/i);
      return [result];
    },
  };
  assert.deepEqual(await service.getTaskStatus('task-id', 'owner-id'), result);
});

test('status polling hides nonexistent and other-owner tasks', async () => {
  const service = Object.create(ImageTaskService.prototype);
  service.prisma = { $queryRaw: async () => [], imageTask: { findFirst: async () => null } };
  await assert.rejects(service.getTaskStatus('missing', 'owner'), e => e.getStatus() === 404);
});

test('task status writes return only the identifier, never the large input payload', () => {
  const fs = require('node:fs');
  const ts = require('typescript');
  const file = ts.createSourceFile('image-task.service.ts', fs.readFileSync(
    require.resolve('../src/ai/services/image-task.service.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  let writes = 0;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'this.prisma.imageTask.update') {
      writes++;
      const select = node.arguments[0].properties.find(p => p.name?.getText(file) === 'select');
      assert.ok(select, 'Every task update must explicitly restrict RETURNING columns');
      assert.equal(select.initializer.properties.length, 1);
      assert.equal(select.initializer.properties[0].name.getText(file), 'id');
      assert.equal(select.initializer.properties[0].initializer.kind, ts.SyntaxKind.TrueKeyword);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(writes, 4);
});
