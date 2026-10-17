require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSupplyChainGallery, parseSupplyChainGallery } = require('../src/admin/supply-chain-gallery');

const image = { id: 'uploaded-image', name: '产品实拍', scene: '产品', imageUrl: 'https://cdn.example.com/products/chair.jpg', isActive: true };

test('empty gallery stays empty and uploaded references survive a storage round trip', () => {
  assert.deepEqual(parseSupplyChainGallery(null), []);
  assert.deepEqual(parseSupplyChainGallery(JSON.stringify([image])), [image]);
  const local = { ...image, imageUrl: '/api/uploads/gallery/chair.jpg', isActive: false };
  assert.deepEqual(validateSupplyChainGallery([local]), [local]);
});

test('temporary, inline and unsafe image references cannot be persisted', () => {
  for (const imageUrl of ['data:image/png;base64,iVBORw0', 'blob:https://example.com/123', 'flow-asset:123', 'iVBORw0KGgoAAA', 'javascript:alert(1)', '//example.com/image.jpg', '/\\example.com/image.jpg']) {
    assert.throws(() => validateSupplyChainGallery([{ ...image, imageUrl }]));
  }
});

test('reject duplicate IDs, missing fields and ambiguous publication state', () => {
  assert.throws(() => validateSupplyChainGallery([image, image]));
  assert.throws(() => validateSupplyChainGallery([{ ...image, name: ' ' }]));
  assert.throws(() => validateSupplyChainGallery([{ ...image, isActive: 'false' }]));
  assert.throws(() => validateSupplyChainGallery({ items: [image] }));
});

test('admin changes are read by the member endpoint, which hides offline images', async () => {
  const { AdminController } = require('../src/admin/admin.controller');
  const { SettingsPublicController } = require('../src/admin/settings-public.controller');
  const { SUPPLY_CHAIN_GALLERY_KEY } = require('../src/admin/supply-chain-gallery');
  const records = new Map();
  const service = {
    getSetting: async (key) => records.get(key),
    upsertSetting: async (key, value) => { records.set(key, { value }); },
  };
  const admin = new AdminController(service);
  const members = new SettingsPublicController(service);
  const request = { user: { id: 'administrator', role: 'admin' } };
  assert.deepEqual(await members.getSupplyChainGallery(), []);
  const hidden = { ...image, id: 'offline-image', isActive: false };
  await admin.saveSupplyChainGallery(request, { items: [image, hidden] });
  assert.ok(records.has(SUPPLY_CHAIN_GALLERY_KEY));
  assert.deepEqual(await members.getSupplyChainGallery(), [image]);
  assert.deepEqual(await admin.getSupplyChainGallery(request), [image, hidden]);
  await admin.saveSupplyChainGallery(request, { items: [] });
  assert.deepEqual(await members.getSupplyChainGallery(), []);
  await assert.rejects(admin.saveSupplyChainGallery({ user: { role: 'user' } }, { items: [image] }));
  assert.ok(Reflect.getMetadata('__guards__', SettingsPublicController.prototype.getSupplyChainGallery)?.length);
});
