import {
  buildKling30TencentCreatePayload,
  extractTencentVodStatus,
  extractTencentVodVideoUrl,
  normalizeTencentVodStatus,
} from '../src/providers-adapters/tencent-vod/tencent-vod.util';

describe('Tencent VOD utilities', () => {
  it('builds a Kling 3.0 create payload from backend-style metadata', () => {
    const payload = buildKling30TencentCreatePayload({
      prompt: 'make a dramatic trailer',
      subAppId: 1427717337,
      referenceImages: ['https://example.com/frame.png'],
      resolution: '720P',
      duration: 5,
      aspectRatio: '16:9',
      mode: 'std',
      sound: 'off',
    });

    expect(payload).toEqual({
      SubAppId: 1427717337,
      ModelName: 'Kling',
      ModelVersion: '3.0',
      Prompt: 'make a dramatic trailer',
      FileInfos: [
        {
          type: 'Url',
          category: 'Image',
          url: 'https://example.com/frame.png',
          objectId: 'id1',
          usage: 'Reference',
        },
      ],
      OutputConfig: {
        StorageMode: 'Temporary',
        AspectRatio: '16:9',
        Duration: 5,
        Resolution: '720P',
        AudioGeneration: 'Disabled',
      },
      EnhancePrompt: 'Enabled',
    });
  });

  it('extracts status and video url from DescribeTaskDetail payload', () => {
    const payload = {
      Status: 'FINISH',
      ProcedureTask: {
        VideoUrl: 'https://example.com/output.mp4',
      },
    };

    expect(extractTencentVodStatus(payload)).toBe('FINISH');
    expect(normalizeTencentVodStatus('FINISH')).toBe('succeeded');
    expect(extractTencentVodVideoUrl(payload)).toBe('https://example.com/output.mp4');
  });
});
