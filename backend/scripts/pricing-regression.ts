import { readFileSync } from 'fs';
import { join } from 'path';
import { CreditsService } from '../src/credits/credits.service';
import { CREDIT_PRICING_CONFIG } from '../src/credits/credits.config';

type QuoteCase = {
  name: string;
  serviceType: string;
  model?: string;
  requestParams?: Record<string, unknown>;
  outputImageCount?: number;
  expectedCredits: number;
};

const repoRoot = join(__dirname, '..', '..');

const pass = (message: string) => {
  console.log(`PASS ${message}`);
};

const fail = (message: string): never => {
  throw new Error(message);
};

const expectEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    fail(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
  pass(`${label}: ${String(expected)}`);
};

const expectIncludes = (
  filePath: string,
  expectedSnippet: string,
  label: string,
) => {
  const absolutePath = join(repoRoot, filePath);
  const content = readFileSync(absolutePath, 'utf8');
  if (!content.includes(expectedSnippet)) {
    fail(`${label}: missing snippet in ${filePath}\n${expectedSnippet}`);
  }
  pass(`${label}: ${filePath}`);
};

const createCreditsServiceHarness = (): any => {
  const service = Object.create(CreditsService.prototype) as any;
  service.logger = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  service.resolveServicePricing = async ({
    serviceType,
  }: {
    serviceType: string;
  }) => {
    if (serviceType === 'gpt-image-2') {
      return {
        serviceName: 'GPT-Image-2',
        provider: 'openai',
        creditsPerCall: 40,
      };
    }
    const pricing = (CREDIT_PRICING_CONFIG as Record<string, any>)[serviceType];
    if (!pricing) return null;
    return {
      ...pricing,
      serviceName: pricing.serviceName,
      provider: pricing.provider,
      creditsPerCall: pricing.creditsPerCall,
    };
  };
  service.resolveManagedRoutePricing = async () => null;
  service.normalizeManagedPricingRequestParams = (params: any) => params;
  service.resolveManagedVideoServiceName = (
    _serviceType: string,
    serviceName: string,
  ) => serviceName;
  service.resolveBananaImageServiceName = (
    _serviceType: string,
    serviceName: string,
  ) => serviceName;
  return service;
};

const quoteCases: QuoteCase[] = [
  {
    name: 'gemini-text normal fast',
    serviceType: 'gemini-text',
    model: 'gemini-2.5-flash-image-preview',
    requestParams: {
      aiProvider: 'banana-2.5',
      channelHint: 'apimart',
      bananaImageRoute: 'normal',
    },
    expectedCredits: 5,
  },
  {
    name: 'gemini-text stable ultra',
    serviceType: 'gemini-text',
    model: 'gemini-3.1-pro-preview',
    requestParams: {
      aiProvider: 'banana-3.1',
      channelHint: 'tencent',
      bananaImageRoute: 'stable',
    },
    expectedCredits: 10,
  },
  {
    name: 'prompt optimize stable pro',
    serviceType: 'gemini-prompt-optimize',
    model: 'gemini-3-flash-preview',
    requestParams: {
      aiProvider: 'banana',
      channelHint: 'tencent',
    },
    expectedCredits: 10,
  },
  {
    name: 'video analyze normal fast',
    serviceType: 'gemini-video-analyze',
    model: 'gemini-2.5-flash-image-preview',
    requestParams: {
      aiProvider: 'banana-2.5',
      channelHint: 'apimart',
      bananaImageRoute: 'normal',
    },
    expectedCredits: 60,
  },
  {
    name: 'video analyze normal pro',
    serviceType: 'gemini-video-analyze',
    model: 'gemini-3-flash-preview',
    requestParams: {
      aiProvider: 'banana',
      channelHint: 'apimart',
      bananaImageRoute: 'normal',
    },
    expectedCredits: 90,
  },
  {
    name: 'video analyze stable ultra',
    serviceType: 'gemini-video-analyze',
    model: 'gemini-3.1-pro-preview',
    requestParams: {
      aiProvider: 'banana-3.1',
      channelHint: 'tencent',
      bananaImageRoute: 'stable',
    },
    expectedCredits: 160,
  },
  {
    name: 'gpt-image-2 normal 2K',
    serviceType: 'gpt-image-2',
    requestParams: {
      aiProvider: 'gpt-image-2',
      imageSize: '2K',
      bananaImageRoute: 'normal',
      channelHint: 'apimart',
      quality: 'auto',
    },
    expectedCredits: 30,
  },
  {
    name: 'gpt-image-2 stable low 1K',
    serviceType: 'gpt-image-2',
    requestParams: {
      aiProvider: 'gpt-image-2',
      imageSize: '1K',
      bananaImageRoute: 'stable',
      channelHint: 'tencent',
      quality: 'low',
    },
    expectedCredits: 30,
  },
  {
    name: 'gpt-image-2 stable medium 2K',
    serviceType: 'gpt-image-2',
    requestParams: {
      aiProvider: 'gpt-image-2',
      imageSize: '2K',
      bananaImageRoute: 'stable',
      channelHint: 'tencent',
      quality: 'medium',
    },
    expectedCredits: 110,
  },
  {
    name: 'gpt-image-2 stable high 4K',
    serviceType: 'gpt-image-2',
    requestParams: {
      aiProvider: 'gpt-image-2',
      imageSize: '4K',
      bananaImageRoute: 'stable',
      channelHint: 'tencent',
      quality: 'high',
    },
    expectedCredits: 560,
  },
  {
    name: 'gemini-2.5-image stable 1K',
    serviceType: 'gemini-2.5-image',
    model: 'gemini-2.5-flash-image-preview',
    requestParams: {
      aiProvider: 'banana-2.5',
      imageSize: '1K',
      bananaImageRoute: 'stable',
      channelHint: 'tencent',
    },
    expectedCredits: 40,
  },
];

async function runBackendQuoteAssertions() {
  const service = createCreditsServiceHarness();
  for (const testCase of quoteCases) {
    const quote = await service.resolveEffectiveCreditsQuote({
      serviceType: testCase.serviceType,
      model: testCase.model,
      requestParams: testCase.requestParams,
      outputImageCount: testCase.outputImageCount,
    });
    expectEqual(
      quote.creditsToDeduct,
      testCase.expectedCredits,
      `backend quote ${testCase.name}`,
    );
  }
}

function runFrontendStaticAssertions() {
  expectIncludes(
    'frontend/src/services/nodeConfigService.ts',
    'nodeKey: "gptImage2"',
    'frontend fallback gptImage2 node exists',
  );
  expectIncludes(
    'frontend/src/services/nodeConfigService.ts',
    'creditsPerCall: 20',
    'frontend fallback gptImage2 credits',
  );
  expectIncludes(
    'frontend/src/services/nodeConfigService.ts',
    'videoAnalyze", nameZh: "视频分析节点", nameEn: "Video Analysis", category: "other", status: "normal", sortOrder: 31, creditsPerCall: 60',
    'frontend fallback videoAnalyze credits',
  );
  expectIncludes(
    'frontend/src/services/nodeConfigService.ts',
    'promptOptimize", nameZh: "提示词优化", nameEn: "Optimize", category: "other", status: "normal", sortOrder: 34, creditsPerCall: 5',
    'frontend fallback promptOptimize credits',
  );
  expectIncludes(
    'frontend/src/services/nodeConfigService.ts',
    'textChat", nameZh: "文字对话", nameEn: "Chat", category: "other", status: "normal", sortOrder: 35, creditsPerCall: 5',
    'frontend fallback textChat credits',
  );
  expectIncludes(
    'frontend/src/components/flow/FlowOverlay.tsx',
    'textChat: 5',
    'flow overlay textChat credits',
  );
  expectIncludes(
    'frontend/src/components/flow/FlowOverlay.tsx',
    'gptImage2: 20',
    'flow overlay gptImage2 credits',
  );
  expectIncludes(
    'frontend/src/components/flow/FlowOverlay.tsx',
    'fast: 60',
    'flow overlay video analyze normal fast credits',
  );
  expectIncludes(
    'frontend/src/components/flow/FlowOverlay.tsx',
    'ultra: 160',
    'flow overlay video analyze stable ultra credits',
  );
  expectIncludes(
    'frontend/src/components/flow/hooks/useImageNodeCreditsPreview.ts',
    'serviceType: "gpt-image-2"',
    'image preview hook uses gpt-image-2 service type',
  );
  expectIncludes(
    'frontend/src/components/flow/hooks/useImageNodeCreditsPreview.ts',
    'quality: quality || "auto"',
    'image preview hook forwards gpt-image-2 quality',
  );
  expectIncludes(
    'backend/src/admin/services/node-config.service.ts',
    "if (nodeKey === 'gptImage2') return 20;",
    'backend canonical gptImage2 credits',
  );
  expectIncludes(
    'frontend/src/components/flow/nodes/Nano2Node.tsx',
    'quality: normalizedQualityValue',
    'nano2 node passes quality to credits preview',
  );
  expectIncludes(
    'frontend/src/components/flow/nodes/VideoAnalyzeNode.tsx',
    "serviceType: 'gemini-video-analyze'",
    'video analyze node uses backend preview service',
  );
  expectIncludes(
    'frontend/src/components/flow/nodes/VideoAnalyzeNode.tsx',
    "bananaImageRoute: analyzeBananaImageRoute",
    'video analyze node forwards route to backend preview',
  );
  expectIncludes(
    'frontend/src/components/flow/nodes/VideoAnalyzeNode.tsx',
    "channelHint: analyzeBananaImageRoute === 'stable' ? 'tencent' : 'apimart'",
    'video analyze node forwards channel hint to backend preview',
  );
  expectIncludes(
    'backend/src/admin/services/node-config.service.ts',
    "if (nodeKey === 'videoAnalyze') return 60;",
    'backend canonical videoAnalyze credits',
  );
  expectIncludes(
    'backend/src/admin/services/node-config.service.ts',
    "if (serviceType === 'gemini-text') return 5;",
    'backend canonical textChat credits',
  );
  expectIncludes(
    'backend/src/admin/services/node-config.service.ts',
    "if (serviceType === 'gemini-prompt-optimize') return 5;",
    'backend canonical promptOptimize credits',
  );
}

async function main() {
  console.log('Running pricing regression checks...');
  await runBackendQuoteAssertions();
  runFrontendStaticAssertions();
  console.log('Pricing regression checks passed.');
}

main().catch((error) => {
  console.error('Pricing regression checks failed.');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
