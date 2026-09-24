import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAIProvider } from './ai-provider.interface';
import { Seedream5Service } from '../services/seedream5.service';
import { getDeploymentBrand } from '../../config/deployment-brand';
import { getToapisApiKey } from '../../utils/toapisHttpClient';

export const SEEDREAM5_PRO_MODEL_ID = 'doubao-seedream-5-0-pro-260628';

@Injectable()
export class Seedream5ProProvider implements IAIProvider {
  private readonly logger = new Logger(Seedream5ProProvider.name);
  private available = false;

  constructor(
    private readonly config: ConfigService,
    private readonly seedream5Service: Seedream5Service,
  ) {}

  async initialize(): Promise<void> {
    if (getDeploymentBrand() === 'linglong') {
      this.available = false;
      this.logger.log(
        'Seedream5Pro provider initialized (linglong): unavailable (Seedream offline)',
      );
      return;
    }

    const doubaoApiKey =
      this.config.get<string>('ARK_API_KEY') ||
      this.config.get<string>('DOUBAO_API_KEY');
    const toapisApiKey = getToapisApiKey();
    this.available = !!doubaoApiKey || !!toapisApiKey;
    this.logger.log(
      `Seedream5Pro provider initialized: ${this.available ? 'available' : 'unavailable'} (doubao=${!!doubaoApiKey}, toapis=${!!toapisApiKey})`,
    );
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProviderInfo(): any {
    return { name: 'seedream5Pro', model: SEEDREAM5_PRO_MODEL_ID };
  }

  async generateImage(request: any): Promise<any> {
    const routes = [
      request.providerOptions?.banana?.imageRoute,
      request.providerOptions?.bananaImageRoute,
    ];
    const imageRoute = routes
      .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
      .find((value) => value === 'normal' || value === 'stable') as 'normal' | 'stable' | undefined;
    const layerDecomposition =
      request.layerDecomposition === true ||
      request.providerOptions?.seedream?.layerDecomposition === true;
    if (layerDecomposition) {
      return {
        success: false,
        error: { message: '图层拆分已不可用' },
      };
    }
    if (getDeploymentBrand() === 'linglong') {
      return {
        success: false,
        error: { message: '玲珑部署已下线 Seedream' },
      };
    }
    const providerInfo = await this.seedream5Service.getProviderExecutionInfo(
      SEEDREAM5_PRO_MODEL_ID,
      imageRoute,
    );
    const result = await this.seedream5Service.generateImage({
      prompt: request.prompt,
      size: request.imageSize || '2K',
      image_urls: request.imageUrls,
      batchMode: request.batchMode,
      batchCount: request.batchCount,
      model: SEEDREAM5_PRO_MODEL_ID,
      imageRoute,
      aspectRatio: request.aspectRatio,
      layerDecomposition,
      watermark: layerDecomposition ? false : undefined,
    });

    this.logger.log(
      `Seedream5Pro generation completed layerDecomposition=${layerDecomposition}`,
    );

    if (result.imageUrl) {
      return {
        success: true,
        data: {
          imageData: null,
          imageUrl: result.imageUrl,
          textResponse: 'Image generated successfully',
          metadata: {
            imageUrl: result.imageUrl,
            provider: 'seedream5Pro',
            aiProvider: 'seedream5Pro',
            model: providerInfo.model,
            channel: providerInfo.provider,
          },
        },
      };
    }
    if (result.imageUrls && result.imageUrls.length > 0) {
      return {
        success: true,
        data: {
          imageData: null,
          imageUrl: result.imageUrls[0],
          imageUrls: result.imageUrls,
          textResponse: `Generated ${result.imageUrls.length} images successfully`,
          metadata: {
            imageUrls: result.imageUrls,
            provider: 'seedream5Pro',
            aiProvider: 'seedream5Pro',
            model: providerInfo.model,
            channel: providerInfo.provider,
          },
        },
      };
    }

    return { success: false, error: { message: 'No images returned' } };
  }

  async editImage(request: any): Promise<any> {
    throw new Error('Seedream5Pro does not support image editing');
  }

  async blendImages(request: any): Promise<any> {
    throw new Error('Seedream5Pro does not support image blending');
  }

  async analyzeImage(request: any): Promise<any> {
    throw new Error('Seedream5Pro does not support image analysis');
  }

  async generateText(request: any): Promise<any> {
    return {
      success: false,
      error: {
        code: 'NOT_SUPPORTED',
        message:
          'Seedream5Pro provider does not support text generation. Please use Banana or Gemini provider for text chat.',
      },
    };
  }

  async selectTool(request: any): Promise<any> {
    return {
      success: false,
      error: {
        code: 'NOT_SUPPORTED',
        message: 'Seedream5Pro provider does not support tool selection.',
      },
    };
  }

  async generatePaperJS(request: any): Promise<any> {
    return {
      success: false,
      error: {
        code: 'NOT_SUPPORTED',
        message: 'Seedream5Pro provider does not support Paper.js generation.',
      },
    };
  }
}
