import { Injectable } from '@nestjs/common';
import {
  ChatCompletionInput,
  ImageEditInput,
  ImageGenerationInput,
  ProviderAdapter,
  RouteResolution,
  SubmitVideoTaskInput,
  VideoTaskQueryResult,
  VideoTaskSubmission,
} from '../provider.interface';

@Injectable()
export class DummyAdapter implements ProviderAdapter {
  readonly providerKey = 'dummy';

  async submitVideoTask(
    route: RouteResolution,
    input: SubmitVideoTaskInput,
  ): Promise<VideoTaskSubmission> {
    return {
      upstreamTaskId: `dummy_${Date.now()}`,
      upstreamStatus: 'queued',
      response: {
        accepted: true,
        route: route.routeKey,
        echoedPrompt: input.prompt ?? null,
      },
    };
  }

  async queryVideoTask(_route: RouteResolution, upstreamTaskId: string): Promise<VideoTaskQueryResult> {
    return {
      upstreamTaskId,
      upstreamStatus: 'completed',
      status: 'succeeded',
      result: {
        url: `https://example.invalid/videos/${upstreamTaskId}.mp4`,
      },
      response: {
        provider: 'dummy',
      },
    };
  }

  async generateImage(_route: RouteResolution, input: ImageGenerationInput): Promise<unknown> {
    return {
      created: Date.now(),
      data: [
        {
          url: `https://example.invalid/images/${encodeURIComponent(input.prompt)}.png`,
        },
      ],
    };
  }

  async editImage(_route: RouteResolution, input: ImageEditInput): Promise<unknown> {
    return {
      created: Date.now(),
      data: [
        {
          url: `https://example.invalid/images/edited/${encodeURIComponent(input.prompt)}.png`,
        },
      ],
    };
  }

  async chatCompletions(_route: RouteResolution, input: ChatCompletionInput): Promise<unknown> {
    const message = input.messages[input.messages.length - 1]?.content ?? '';
    return {
      id: `chatcmpl_dummy_${Date.now()}`,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: `dummy echo: ${message}`,
          },
        },
      ],
    };
  }
}
