require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VideoProviderService } = require('../src/ai/services/video-provider.service');
const service = Object.create(VideoProviderService.prototype);
const build = (extra = {}) => service.buildSeedance25ToapisPayload({
  provider: 'doubao', seedanceModel: 'seedance-2.0', prompt: 'product video',
  duration: 6, resolution: '720P', aspectRatio: '16:9', ...extra,
});
const urls = ['https://example.com/one.png', 'https://example.com/two.png'];

for (const seedanceModel of ['seedance-2.0', 'seedance-2.0-fast', 'seedance-2.5']) {
  test(`${seedanceModel}: explicit frame roles and integer duration`, () => {
    const p = build({ seedanceModel, videoMode: 'start_end', referenceImages: urls });
    assert.equal(p.duration, 6);
    assert.deepEqual(p.image_with_roles, [{ url: urls[0], role: 'first_frame' }, { url: urls[1], role: 'last_frame' }]);
    assert.equal('image_urls' in p, false);
    if (seedanceModel === 'seedance-2.5') assert.equal(p.aspect_ratio, 'adaptive');
  });
  test(`${seedanceModel}: retains image/video/audio reference roles`, () => {
    const p = build({ seedanceModel, videoMode: 'reference_images', referenceImages: urls,
      referenceVideos: ['https://example.com/motion.mp4'], audioUrls: ['https://example.com/sound.mp3'] });
    assert.deepEqual(p.image_with_roles, urls.map(url => ({ url, role: 'reference_image' })));
    assert.equal(p.video_with_roles[0].role, 'reference_video');
    assert.equal(p.audio_with_roles[0].role, 'reference_audio');
  });
}
test('Fast uses its own upstream model; standard 4K and adaptive are preserved', () => {
  assert.equal(build({ seedanceModel: 'seedance-2.0-fast' }).model, 'seedance-2-fast');
  const p = build({ resolution: '4K', aspectRatio: 'auto' });
  assert.equal(p.resolution, '4k');
  assert.equal(p.aspect_ratio, 'adaptive');
});
test('invalid parameters fail explicitly instead of silently changing generation or dropping media', () => {
  for (const options of [
    { duration: 16 }, { duration: 0 }, { duration: 5.5 },
    { seedanceModel: 'seedance-2.0-fast', resolution: '1080P' },
    { seedanceModel: 'seedance-2.5', resolution: '4K' },
    { referenceImages: ['data:image/png;base64,abc'] },
    { referenceImages: ['asset://old'] },
    { videoMode: 'first_frame', referenceImages: urls },
    { videoMode: 'start_end', referenceImages: urls, audioUrls: ['https://example.com/sound.mp3'] },
    { audioUrls: ['https://example.com/sound.mp3'] },
    { referenceImages: Array(10).fill(urls[0]), videoMode: 'reference_images' },
  ]) assert.throws(() => build(options));
});
test('2.5 accepts audio-only references and 4..30 integer seconds', () => {
  const p = build({ seedanceModel: 'seedance-2.5', duration: 29, prompt: '', audioUrls: ['https://example.com/sound.mp3'] });
  assert.equal(p.duration, 29);
  assert.equal(p.audio_with_roles.length, 1);
});
