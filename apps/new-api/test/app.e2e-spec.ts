import request = require('supertest');
import { createTestingApp } from './test-helpers';

describe('App smoke (e2e)', () => {
  it('returns route not configured when posting video without mapping', async () => {
    const { app } = await createTestingApp();

    await request(app.getHttpServer())
      .post('/v1/videos')
      .set('Authorization', 'Bearer bootstrap-token')
      .send({
        model: 'missing-model',
      })
      .expect(404);

    await app.close();
  });
});
