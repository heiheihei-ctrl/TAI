import request = require('supertest');
import { createTestingApp } from './test-helpers';

describe('HealthController (e2e)', () => {
  it('GET /api/status should be public and expose db/redis status', async () => {
    const { app } = await createTestingApp();

    await request(app.getHttpServer())
      .get('/api/status')
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
        expect(body.service).toBe('new-api');
        expect(body.db).toBe('ok');
        expect(body.redis).toBe('ok');
      });

    await app.close();
  });
});
