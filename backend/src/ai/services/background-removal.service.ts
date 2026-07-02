import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { ConfigService } from '@nestjs/config';
import { getSharpLoadError, isSharpAvailable } from '../../utils/sharp-loader';

/**
 * 后端背景移除服务
 * 优先使用 remove.bg API（如果配置了 API Key），否则使用本地 ONNX
 * 输出透明PNG格式
 */
@Injectable()
export class BackgroundRemovalService {
  private readonly logger = new Logger(BackgroundRemovalService.name);
  private removalModule: any = null;

  constructor(private readonly configService: ConfigService) {}

  private getRemoveBgApiKey(): string {
    return (this.configService.get<string>('REMOVE_BG_API_KEY') || process.env.REMOVE_BG_API_KEY || '').trim();
  }

  private hasRemoveBgKey(): boolean {
    return this.getRemoveBgApiKey().length > 0;
  }

  private summarizeLoaderError(error: unknown): string {
    if (error instanceof Error) {
      const anyError = error as Error & { code?: string; cause?: unknown };
      const code = anyError.code ? ` code=${String(anyError.code)}` : '';
      const cause =
        anyError.cause instanceof Error
          ? ` cause=${anyError.cause.name}:${anyError.cause.message}`
          : '';
      return `${anyError.name}: ${anyError.message}${code}${cause}`;
    }
    return String(error);
  }

  /** 解析 backend 根目录（含 package.json / node_modules） */
  private resolveBackendRoot(): string {
    const candidates = [
      path.resolve(__dirname, '../../..'),
      process.cwd(),
      path.resolve(process.cwd(), 'backend'),
    ];

    for (const dir of candidates) {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === 'tanva-server') {
          return dir;
        }
      } catch {
        // ignore invalid package.json
      }
    }

    return process.cwd();
  }

  private getModuleLookupPaths(): string[] {
    const root = this.resolveBackendRoot();
    return Array.from(new Set([__dirname, root, process.cwd(), path.resolve(root, '..')]));
  }

  private tryResolveRemovalModuleEntry(): string | null {
    const packageSpec = '@imgly/background-removal-node';

    for (const basePath of this.getModuleLookupPaths()) {
      try {
        return require.resolve(packageSpec, { paths: [basePath] });
      } catch {
        // ignore and continue
      }
    }

    return null;
  }

  private resolveRemovalModuleEntry(): string {
    const entry = this.tryResolveRemovalModuleEntry();
    if (entry) {
      return entry;
    }
    return require.resolve('@imgly/background-removal-node');
  }

  /**
   * 使用 remove.bg API 移除背景
   */
  private async removeBackgroundViaRemoveBg(imageBuffer: Buffer): Promise<string> {
    const apiKey = this.getRemoveBgApiKey();
    if (!apiKey) {
      throw new Error('REMOVE_BG_API_KEY not configured');
    }

    this.logger.log('🌐 Using remove.bg API for background removal...');

    const formData = new FormData();
    formData.append('image_file', new Blob([imageBuffer]), 'image.png');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`remove.bg API error: HTTP ${response.status} ${errorText}`);
    }

    const resultBuffer = Buffer.from(await response.arrayBuffer());
    const resultBase64 = resultBuffer.toString('base64');

    this.logger.log(`✅ remove.bg API completed. Output: ${(resultBuffer.length / 1024).toFixed(2)}KB`);

    return `data:image/png;base64,${resultBase64}`;
  }

  /**
   * 延迟加载本地背景移除模块（失败不缓存，便于部署修复后自动恢复）
   */
  private async getRemovalModule() {
    if (this.removalModule) {
      return this.removalModule;
    }

    try {
      this.logger.log('📦 Loading @imgly/background-removal-node module...');
      const entryPath = this.resolveRemovalModuleEntry();
      this.logger.log(`📦 Resolved @imgly/background-removal-node entry: ${entryPath}`);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(entryPath);
      this.removalModule = mod;
      this.logger.log('✅ @imgly/background-removal-node loaded successfully');
      return mod;
    } catch (error) {
      const detail = this.summarizeLoaderError(error);
      this.logger.error(`❌ Failed to load @imgly/background-removal-node: ${detail}`);
      throw new Error(`Background removal module is not available. ${detail}`);
    }
  }

  private resolveLocalWorkerPath(): string | null {
    const workerExt = __filename.endsWith('.ts') ? 'ts' : 'js';
    const root = this.resolveBackendRoot();
    const candidates = [
      path.resolve(__dirname, `../workers/background-removal.worker.${workerExt}`),
      path.resolve(root, 'dist/ai/workers/background-removal.worker.js'),
      path.resolve(root, 'src/ai/workers/background-removal.worker.ts'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private tryResolveLocalModelDistDir(): string | null {
    const packageSpec = '@imgly/background-removal-node/package.json';

    for (const basePath of this.getModuleLookupPaths()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const packageJsonPath = require.resolve(packageSpec, { paths: [basePath] });
        const packageDir = path.dirname(packageJsonPath);
        const distDir = path.join(packageDir, 'dist');
        const resourcesPath = path.join(distDir, 'resources.json');
        if (fs.existsSync(resourcesPath)) {
          return distDir;
        }
      } catch {
        // ignore and continue fallback candidates
      }
    }

    const root = this.resolveBackendRoot();
    const fallbackDirs = [
      path.join(root, 'node_modules/@imgly/background-removal-node/dist'),
      path.join(process.cwd(), 'node_modules/@imgly/background-removal-node/dist'),
    ];

    for (const dir of fallbackDirs) {
      if (fs.existsSync(path.join(dir, 'resources.json'))) {
        return dir;
      }
    }

    return null;
  }

  private hasLocalResources(): boolean {
    return this.tryResolveLocalModelDistDir() !== null;
  }

  private isLocalRemovalEnabled(): boolean {
    const flag = (
      this.configService.get<string>('BACKGROUND_REMOVAL_LOCAL') ||
      process.env.BACKGROUND_REMOVAL_LOCAL ||
      'true'
    )
      .trim()
      .toLowerCase();
    return flag !== 'false' && flag !== '0' && isSharpAvailable();
  }

  private isSharpLoadable(): boolean {
    return isSharpAvailable();
  }

  /**
   * 使用本地 ONNX 模块移除背景：仅走隔离 worker，生产环境禁止主进程加载 ONNX（否则会 segfault → 502）
   */
  private async removeBackgroundLocal(imageBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.isLocalRemovalEnabled()) {
      throw new Error(
        `Local background removal requires sharp. ${getSharpLoadError() ?? 'sharp unavailable'}`
      );
    }

    const workerPath = this.resolveLocalWorkerPath();
    if (!workerPath) {
      const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (isProd) {
        throw new Error(
          'background-removal.worker.js not found in production. Run npm run build or configure REMOVE_BG_API_KEY.',
        );
      }
      this.logger.warn(
        '⚠️ background-removal.worker.js not found, falling back to in-process ONNX (dev only)',
      );
      return this.removeBackgroundLocalInProcess(imageBuffer, mimeType);
    }

    return await this.removeBackgroundLocalIsolated(imageBuffer, mimeType, workerPath);
  }

  /** 仅开发环境使用：主进程加载 ONNX，Linux 生产环境可能 segfault */
  private async removeBackgroundLocalInProcess(
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const blob = new Blob([imageBuffer], { type: mimeType || 'image/png' });
    const mod = await this.getRemovalModule();
    const publicPath = this.resolveLocalModelPublicPath();

    const timeoutMs = 120000;
    const resultPromise = mod.removeBackground(blob, {
      publicPath,
      output: {
        format: 'image/png',
        quality: 0.8,
      },
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Background removal timed out')), timeoutMs);
    });

    const result = (await Promise.race([resultPromise, timeoutPromise])) as Blob;
    const arrayBuffer = await result.arrayBuffer();
    const resultBuffer = Buffer.from(arrayBuffer);
    const resultBase64 = resultBuffer.toString('base64');

    this.logger.log(
      `✅ Local background removal completed. Output: ${(resultBuffer.length / 1024).toFixed(2)}KB`
    );

    return `data:image/png;base64,${resultBase64}`;
  }

  private buildUnavailableMessage(): string {
    const diagnostics = this.getDiagnostics();
    const hints: string[] = [];

    if (!diagnostics.hasRemoveBgKey) {
      hints.push('本地 ONNX 未就绪（见下方其他项）');
    }
    if (!diagnostics.moduleInstalled) {
      hints.push('在后端目录执行 npm install（需安装 @imgly/background-removal-node）');
    }
    if (!diagnostics.workerPath) {
      hints.push('在后端目录执行 npm run build（需生成 dist/ai/workers/background-removal.worker.js）');
    }
    if (!diagnostics.resourcesFound) {
      hints.push('确认 node_modules/@imgly/background-removal-node/dist/resources.json 存在');
    }
    if (!diagnostics.sharpLoadable) {
      hints.push(
        'sharp 不可用：在后端执行 rm -rf node_modules && pnpm install && node scripts/fix-sharp-install.js'
      );
    }

    const hintText = hints.length > 0 ? hints.join('；') : '请检查后端部署';
    return `Background removal is unavailable: local ONNX is not ready. ${hintText}`;
  }

  private async removeBackgroundWithProviderFallback(
    imageBuffer: Buffer,
    mimeType: string,
    sourceLabel: 'base64' | 'url' | 'file',
  ): Promise<string> {
    const hasRemoveBgKey = this.hasRemoveBgKey();
    const localEnabled = this.isLocalRemovalEnabled();

    if (hasRemoveBgKey) {
      this.logger.log('🌐 REMOVE_BG_API_KEY configured, will use remove.bg cloud API');
      try {
        return await this.removeBackgroundViaRemoveBg(imageBuffer);
      } catch (error) {
        const removeBgMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ remove.bg API failed for ${sourceLabel}:`, removeBgMessage);

        if (!localEnabled) {
          throw new BadRequestException(
            `remove.bg 抠图失败: ${removeBgMessage}。本地抠图因 sharp 不可用已跳过，请检查 API Key 或网络。`
          );
        }

        this.logger.warn(`⚠️ remove.bg failed for ${sourceLabel}, trying local module...`);
      }
    }

    if (!localEnabled) {
      throw new BadRequestException(this.buildUnavailableMessage());
    }

    try {
      return await this.removeBackgroundLocal(imageBuffer, mimeType);
    } catch (localError) {
      const localMessage = localError instanceof Error ? localError.message : String(localError);
      this.logger.error(`❌ Local background removal failed for ${sourceLabel}:`, localMessage);

      if (hasRemoveBgKey) {
        throw new BadRequestException(
          `Background removal failed. Both remove.bg API and local module failed. Local error: ${localMessage}`
        );
      }

      throw new BadRequestException(
        `Background removal failed: ${localMessage}. Consider configuring REMOVE_BG_API_KEY for better reliability.`
      );
    }
  }

  private async removeBackgroundLocalIsolated(
    imageBuffer: Buffer,
    mimeType: string,
    workerPath: string,
  ): Promise<string> {
    const args = workerPath.endsWith('.ts')
      ? ['-r', 'ts-node/register/transpile-only', workerPath]
      : [workerPath];

    this.logger.log(`🧩 Running local background removal in isolated worker: ${workerPath}`);

    const child = spawn(process.execPath, args, {
      cwd: this.resolveBackendRoot(),
      env: {
        ...process.env,
        OMP_NUM_THREADS: '1',
        ORT_DISABLE_CPU_AFFINITY: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timeoutMs = 120000;

    return await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        if (!settled) {
          settled = true;
          reject(new Error('Background removal worker timed out'));
        }
      }, timeoutMs);

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
        finish(() => reject(error));
      });

      child.on('close', (code, signal) => {
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();

        if (trimmedStdout) {
          try {
            const parsed = JSON.parse(trimmedStdout) as {
              ok?: boolean;
              imageData?: string;
              error?: string;
            };

            if (parsed.ok && typeof parsed.imageData === 'string' && parsed.imageData.length > 0) {
              finish(() => resolve(parsed.imageData as string));
              return;
            }

            finish(() =>
              reject(
                new Error(
                  parsed.error ||
                    `Background removal worker failed with exit code ${code ?? 'unknown'}`
                )
              )
            );
            return;
          } catch {
            // ignore parse error and use generic crash detail below
          }
        }

        const crashDetail = trimmedStderr || `exit=${code ?? 'null'} signal=${signal ?? 'null'}`;
        finish(() =>
          reject(
            new Error(`Background removal worker crashed before returning a result: ${crashDetail}`)
          )
        );
      });

      child.stdin.write(
        JSON.stringify({
          imageBase64: imageBuffer.toString('base64'),
          mimeType,
        })
      );
      child.stdin.end();
    });
  }

  private resolveLocalModelPublicPath(): string {
    const distDir = this.tryResolveLocalModelDistDir();
    if (!distDir) {
      throw new Error(
        'Local background removal resources not found. Missing @imgly/background-removal-node/dist/resources.json'
      );
    }

    const fileUrl = pathToFileURL(distDir).href;
    return fileUrl.endsWith('/') ? fileUrl : `${fileUrl}/`;
  }

  getDiagnostics(): {
    backendRoot: string;
    workerPath: string | null;
    moduleEntry: string | null;
    resourcesFound: boolean;
    moduleInstalled: boolean;
    hasRemoveBgKey: boolean;
    sharpLoadable: boolean;
    sharpError?: string;
  } {
    const moduleEntry = this.tryResolveRemovalModuleEntry();
    const sharpLoadable = this.isSharpLoadable();
    const sharpError = sharpLoadable ? undefined : getSharpLoadError();

    return {
      backendRoot: this.resolveBackendRoot(),
      workerPath: this.resolveLocalWorkerPath(),
      moduleEntry,
      resourcesFound: this.hasLocalResources(),
      moduleInstalled: moduleEntry !== null,
      hasRemoveBgKey: this.hasRemoveBgKey(),
      sharpLoadable,
      sharpError,
    };
  }

  async removeBackgroundFromBase64(
    imageData: string,
    mimeType: string = 'image/png'
  ): Promise<string> {
    this.logger.log('🎯 Starting background removal from base64 data');

    if (!imageData || typeof imageData !== 'string') {
      throw new BadRequestException('Invalid image data provided');
    }

    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const buffer = Buffer.from(base64Data, 'base64');

    this.logger.log(`📊 Input image: ${(buffer.length / 1024).toFixed(2)}KB, MIME type: ${mimeType}`);

    return this.removeBackgroundWithProviderFallback(buffer, mimeType, 'base64');
  }

  async removeBackgroundFromUrl(imageUrl: string): Promise<string> {
    this.logger.log(`🌐 Fetching image from URL: ${imageUrl}`);

    const url = new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Invalid URL protocol');
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch image: HTTP ${response.status}`);
    }

    const mimeType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    this.logger.log(`📊 Fetched image: ${(buffer.length / 1024).toFixed(2)}KB, MIME type: ${mimeType}`);

    return this.removeBackgroundWithProviderFallback(buffer, mimeType, 'url');
  }

  async removeBackgroundFromFile(filePath: string): Promise<string> {
    this.logger.log(`📁 Reading image from file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`File not found: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypeMap[ext] || 'image/png';

    this.logger.log(`📊 File size: ${(fileBuffer.length / 1024).toFixed(2)}KB, MIME type: ${mimeType}`);

    return this.removeBackgroundWithProviderFallback(fileBuffer, mimeType, 'file');
  }

  async isAvailable(): Promise<boolean> {
    if (this.hasRemoveBgKey()) {
      return true;
    }
    const diagnostics = this.getDiagnostics();
    return diagnostics.sharpLoadable && (Boolean(diagnostics.workerPath) || diagnostics.moduleInstalled);
  }

  async getInfo(): Promise<{
    available: boolean;
    version?: string;
    features: string[];
    provider?: string;
    platform?: string;
    reason?: string;
    diagnostics?: ReturnType<BackgroundRemovalService['getDiagnostics']>;
  }> {
    const diagnostics = this.getDiagnostics();

    if (diagnostics.hasRemoveBgKey) {
      return {
        available: true,
        version: 'remove.bg API',
        provider: 'remove.bg',
        platform: process.platform,
        diagnostics,
        features: [
          'Remove background with transparency',
          'Support PNG, JPEG, GIF, WebP',
          'High quality AI-powered removal',
          'Cloud-based processing',
        ],
      };
    }

    if (diagnostics.workerPath || diagnostics.moduleInstalled) {
      const sharpReady = diagnostics.sharpLoadable;
      return {
        available: sharpReady,
        version: diagnostics.workerPath ? 'isolated-worker' : 'local-onnx',
        provider: diagnostics.workerPath ? 'local-onnx-worker' : 'local-onnx',
        platform: process.platform,
        diagnostics,
        reason: sharpReady
          ? diagnostics.workerPath
            ? '将通过隔离子进程使用本地 ONNX 抠图（与本地开发相同）。'
            : '将尝试主进程本地 ONNX 抠图（开发环境）。'
          : `sharp 原生模块不可用：${diagnostics.sharpError ?? 'unknown'}. 请执行 node scripts/fix-sharp-install.js`,
        features: sharpReady
          ? [
              'Remove background with transparency',
              'Support PNG, JPEG, GIF, WebP',
              'Isolated worker processing',
            ]
          : [],
      };
    }

    return {
      available: false,
      provider: 'none',
      platform: process.platform,
      diagnostics,
      reason:
        '本地抠图依赖未就绪：请在后端执行 npm install && npm run build，并运行 node scripts/diagnose-background-removal.js。',
      features: [],
    };
  }
}
