import request = require('supertest');
import { hashToken } from '../src/common/auth/auth.util';
import { createTestingApp, createPrismaMock } from './test-helpers';

describe('Auth (e2e)', () => {
  it('rejects protected route without bearer token', async () => {
    const { app } = await createTestingApp();

    await request(app.getHttpServer()).get('/admin/providers').expect(401);
    await app.close();
  });

  it('accepts bootstrap token on protected route', async () => {
    const { app } = await createTestingApp();

    await request(app.getHttpServer())
      .get('/admin/providers')
      .set('Authorization', 'Bearer bootstrap-token')
      .expect(200);

    await app.close();
  });

  it('accepts hashed database token', async () => {
    const prismaMock = createPrismaMock();
    prismaMock.__data.apiTokens.push({
      id: 'tok_1',
      name: 'backend',
      tokenHash: hashToken('db-token'),
      status: 'active',
      scopes: ['admin', 'gateway'],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
    });
    const { app } = await createTestingApp({ prismaMock });

    await request(app.getHttpServer())
      .get('/admin/providers')
      .set('Authorization', 'Bearer db-token')
      .expect(200);

    await app.close();
  });
});
