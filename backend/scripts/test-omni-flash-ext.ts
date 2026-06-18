import assert from 'node:assert/strict';
import {
  buildOmniFlashExtApimartPayload,
  buildOmniFlashExtNewApiPayload,
  isOmniFlashExtModelKey,
  parseOmniFlashExtTaskResponse,
} from '../src/ai/services/omni-flash-ext.adapter';

const img = (index: number) => `https://example.com/ref-${index}.png`;
const video = (index: number) => `https://example.com/ref-${index}.mp4`;

const assertThrowsMessage = (fn: () => unknown, messagePart: string) => {
  assert.throws(fn, (error: any) => {
    assert.match(String(error?.message || error), new RegExp(messagePart));
    return true;
  });
};

{
  const payload = buildOmniFlashExtNewApiPayload({
    prompt: '生成夜景视频',
    referenceImages: [img(1)],
    videoMode: 'frame',
    duration: 6,
    resolution: '720P',
    aspectRatio: '16:9',
  });
  assert.equal(payload.metadata.generation_type, 'frame');
  assert.equal(payload.duration, 6);
  assert.equal(payload.model, 'omni-flash-ext');
}

{
  const payload = buildOmniFlashExtNewApiPayload({
    prompt: '生成夜景视频',
    referenceImages: [img(1)],
    videoMode: 'reference',
  });
  assert.equal(payload.metadata.generation_type, 'reference');
}

{
  const payload = buildOmniFlashExtNewApiPayload({
    prompt: '生成夜景视频',
    referenceImages: [img(1), img(2)],
    videoMode: 'frame',
  });
  assert.equal(payload.metadata.generation_type, 'reference');
}

{
  const payload = buildOmniFlashExtNewApiPayload({
    prompt: '生成夜景视频',
    referenceImages: [img(1), img(2), img(3)],
    videoMode: 'reference',
  });
  assert.equal(payload.metadata.generation_type, 'reference');
  assert.equal(payload.images?.length, 3);
}

assertThrowsMessage(
  () =>
    buildOmniFlashExtNewApiPayload({
      prompt: '生成夜景视频',
      referenceImages: [img(1), img(2), img(3), img(4)],
      videoMode: 'reference',
    }),
  '图片最多 3 张',
);

{
  const payload = buildOmniFlashExtNewApiPayload({
    prompt: '生成夜景视频',
    referenceImages: [img(1)],
    referenceVideos: [video(1)],
    videoMode: 'frame',
    duration: 10,
  });
  assert.equal(payload.metadata.generation_type, 'reference');
  assert.equal(payload.duration, undefined);
  assert.deepEqual(payload.metadata.video_urls, [video(1)]);
}

assertThrowsMessage(
  () =>
    buildOmniFlashExtNewApiPayload({
      prompt: '生成夜景视频',
      referenceImages: [img(1)],
      referenceVideos: [video(1), video(2)],
      videoMode: 'reference',
    }),
  '最多支持 1 条参考视频',
);

assertThrowsMessage(
  () =>
    buildOmniFlashExtNewApiPayload({
      prompt: '',
      referenceImages: [img(1)],
      videoMode: 'frame',
    }),
  '非空提示词',
);

assertThrowsMessage(
  () =>
    buildOmniFlashExtApimartPayload({
      model: 'omni-flash-ext',
      prompt: '生成夜景视频',
      image: img(1),
      images: [img(1), img(2)],
      duration: 6,
      resolution: '720p',
      aspect_ratio: '16:9',
      metadata: { generation_type: 'frame' },
      provider_options: {
        managedModelKey: 'omni-flash-ext',
        videoMode: 'frame',
      },
    }),
  '2 张及以上图片必须使用 reference',
);

{
  const apimartPayload = buildOmniFlashExtApimartPayload(
    buildOmniFlashExtNewApiPayload({
      prompt: '生成夜景视频',
      referenceImages: [img(1)],
      videoMode: 'frame',
    }),
  );
  assert.equal(apimartPayload.model, 'Omni-Flash-Ext');
}

assert.equal(isOmniFlashExtModelKey('omni-flash-ext'), true);
assert.equal(isOmniFlashExtModelKey('omni-flash-ext-apimart'), true);
assert.equal(isOmniFlashExtModelKey('kling-v3-0'), false);

{
  const result = parseOmniFlashExtTaskResponse(
    {
      code: 200,
      data: {
        task_id: 'task-success-result',
        status: 'SUCCESS',
        result: {
          videos: [
            {
              url: ['https://example.com/result.mp4'],
              cover_image_url: 'https://example.com/cover.jpg',
            },
          ],
        },
      },
    },
    'task-success-result',
  );
  assert.equal(result.status, 'succeeded');
  assert.equal(result.videoUrl, 'https://example.com/result.mp4');
  assert.equal(result.thumbnailUrl, 'https://example.com/cover.jpg');
}

{
  const result = parseOmniFlashExtTaskResponse({
    code: 200,
    data: {
      task_id: 'task-success-task-result',
      status: 'completed',
      task_result: {
        videos: [
          {
            video_url: 'https://example.com/task-result.mp4',
            cover_image_url: 'https://example.com/task-result-cover.png',
          },
        ],
      },
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.videoUrl, 'https://example.com/task-result.mp4');
  assert.equal(result.thumbnailUrl, 'https://example.com/task-result-cover.png');
}

{
  const result = parseOmniFlashExtTaskResponse(
    {
      code: 200,
      data: [
        {
          task_id: 'other-task',
          status: 'processing',
        },
        {
          task_id: 'matched-task',
          status: 'success',
          output: {
            download_url: 'https://example.com/matched.mp4',
          },
        },
      ],
    },
    'matched-task',
  );
  assert.equal(result.status, 'succeeded');
  assert.equal(result.videoUrl, 'https://example.com/matched.mp4');
}

{
  const result = parseOmniFlashExtTaskResponse({
    data: {
      status: 'failed',
    },
  });
  assert.equal(result.status, 'failed');
}

console.log('Omni Flash Ext adapter tests passed');
