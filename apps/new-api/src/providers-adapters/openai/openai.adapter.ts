import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
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
export class OpenaiAdapter implements ProviderAdapter {
  readonly providerKey = 'openai';

  async submitVideoTask(_route: RouteResolution, _input: SubmitVideoTaskInput): Promise<VideoTaskSubmission> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'OpenAI adapter is not implemented yet', 501);
  }

  async queryVideoTask(_route: RouteResolution, _upstreamTaskId: string): Promise<VideoTaskQueryResult> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'OpenAI adapter is not implemented yet', 501);
  }

  async generateImage(_route: RouteResolution, _input: ImageGenerationInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'OpenAI adapter is not implemented yet', 501);
  }

  async editImage(_route: RouteResolution, _input: ImageEditInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'OpenAI adapter is not implemented yet', 501);
  }

  async chatCompletions(_route: RouteResolution, _input: ChatCompletionInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'OpenAI adapter is not implemented yet', 501);
  }
}
