import request = require('supertest');
import { createTestingApp } from './test-helpers';

describe('Video gateway (e2e)', () => {
  it('returns explicit route error when model exists but route is missing', async () => {
    const { app } = await createTestingApp();
    const agent = request(app.getHttpServer());
    const auth = { Authorization: 'Bearer bootstrap-token' };

    await agent
      .post('/admin/models')
      .set(auth)
      .send({
        modelKey: 'orphan-video',
        name: 'Orphan Video',
        taskType: 'video',
        protocolType: 'task',
      })
      .expect(201);

    await agent
      .post('/v1/videos')
      .set(auth)
      .send({
        model: 'orphan-video',
        prompt: 'test',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('MODEL_ROUTE_NOT_CONFIGURED');
        expect(body.error.message).toBe('model route not configured');
      });

    await app.close();
  });

  it('submits and queries dummy video task when mapping exists', async () => {
    const { app } = await createTestingApp();
    const agent = request(app.getHttpServer());
    const auth = { Authorization: 'Bearer bootstrap-token' };

    const provider = await agent
      .post('/admin/providers')
      .set(auth)
      .send({ providerKey: 'dummy', name: 'Dummy', type: 'demo' })
      .expect(201);
    const channel = await agent
      .post('/admin/channels')
      .set(auth)
      .send({
        providerId: provider.body.data.id,
        channelKey: 'dummy-video-main',
        name: 'Dummy Video Main',
        credentialType: 'none',
      })
      .expect(201);
    const model = await agent
      .post('/admin/models')
      .set(auth)
      .send({
        modelKey: 'dummy-video',
        name: 'Dummy Video',
        taskType: 'video',
        protocolType: 'task',
      })
      .expect(201);

    await agent
      .post('/admin/model-mappings')
      .set(auth)
      .send({
        modelId: model.body.data.id,
        providerId: provider.body.data.id,
        channelId: channel.body.data.id,
        routeKey: 'dummy.video',
      })
      .expect(201);

    const submit = await agent
      .post('/v1/videos')
      .set(auth)
      .send({
        model: 'dummy-video',
        prompt: 'hello',
      })
      .expect(201);

    expect(submit.body.status).toBe('queued');

    await agent
      .get(`/v1/videos/${submit.body.task_id}`)
      .set(auth)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('succeeded');
        expect(body.result.url).toContain('.mp4');
      });

    await app.close();
  });
});
