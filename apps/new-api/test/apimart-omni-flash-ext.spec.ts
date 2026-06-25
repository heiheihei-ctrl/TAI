import {
  buildOmniFlashExtApimartPayload,
  parseOmniFlashExtTaskResponse,
} from '../src/providers-adapters/apimart/omni-flash-ext.util';

describe('APIMart Omni Flash Ext utilities', () => {
  it('builds an APIMart payload from backend-style metadata', () => {
    const payload = buildOmniFlashExtApimartPayload({
      prompt: 'make a cinematic clip',
      metadata: {
        referenceImages: ['https://example.com/frame.png'],
        referenceVideos: ['https://example.com/ref.mp4'],
        videoMode: 'reference',
        duration: 8,
        resolution: '1080P',
        aspectRatio: '9:16',
      },
    });

    expect(payload).toEqual({
      model: 'Omni-Flash-Ext',
      prompt: 'make a cinematic clip',
      image_urls: ['https://example.com/frame.png'],
      video_urls: ['https://example.com/ref.mp4'],
      generation_type: 'reference',
      resolution: '1080p',
      aspect_ratio: '9:16',
    });
  });

  it('normalizes a completed task response', () => {
    const parsed = parseOmniFlashExtTaskResponse({
      data: {
        id: 'task_123',
        status: 'completed',
        result: {
          videos: [
            {
              video_url: 'https://example.com/result.mp4',
              thumbnail_url: 'https://example.com/result.jpg',
            },
          ],
        },
      },
    }, 'task_123');

    expect(parsed).toEqual({
      status: 'succeeded',
      rawStatus: 'completed',
      videoUrl: 'https://example.com/result.mp4',
      thumbnailUrl: 'https://example.com/result.jpg',
    });
  });
});
