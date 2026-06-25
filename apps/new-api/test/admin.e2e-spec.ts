import request = require('supertest');
import { createTestingApp } from './test-helpers';

describe('AdminController (e2e)', () => {
  it('creates provider/channel/model/mapping and masks secrets in channel list', async () => {
    const { app } = await createTestingApp();
    const agent = request(app.getHttpServer());
    const auth = { Authorization: 'Bearer bootstrap-token' };

    const provider = await agent
      .post('/admin/providers')
      .set(auth)
      .send({
        providerKey: 'dummy',
        name: 'Dummy',
        type: 'demo',
      })
      .expect(201);

    const channel = await agent
      .post('/admin/channels')
      .set(auth)
      .send({
        providerId: provider.body.data.id,
        channelKey: 'dummy-main',
        name: 'Dummy Main',
        credentialType: 'api_key',
        credentialsJson: {
          apiKey: 'secret-key',
        },
      })
      .expect(201);

    expect(channel.body.data.credentialsJson.apiKey).toContain('****');

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

    const mapping = await agent
      .post('/admin/model-mappings')
      .set(auth)
      .send({
        modelId: model.body.data.id,
        providerId: provider.body.data.id,
        channelId: channel.body.data.id,
        routeKey: 'dummy.video',
      })
      .expect(201);

    await agent
      .patch(`/admin/model-mappings/${mapping.body.data.id}/enabled`)
      .set(auth)
      .send({ enabled: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.enabled).toBe(false);
      });

    await app.close();
  });
});
