/**
 * 前端背景移除服务
 * 当前统一走后端公开 API:
 * 1. 前端将当前图片整理为 base64
 * 2. POST /api/public/ai/remove-background
 * 3. 后端根据环境选择 remove.bg 或本地 ONNX provider
 */

import { logger } from "@/utils/logger";
import { fetchWithAuth } from "./authFetch";

// 后端基础地址，统一从 .env 中读取；无配置时使用相对路径（通过 Vite 代理）
const API_BASE =
  import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
    : "";

export interface BackgroundRemovalResult {
  success: boolean;
  imageData?: string; // base64 PNG with transparency
  error?: string;
  processingTime?: number;
  method?: "frontend" | "backend";
}

class BackgroundRemovalService {
  private isFrontendAvailable = false;

  /**
   * 检查前端库是否可用
   * 这是可选的,库不存在时后端会接管所有请求
   */
  async checkFrontendAvailable(): Promise<boolean> {
    if (this.isFrontendAvailable) return true;

    try {
      // 尝试检查库是否存在
      // 注意: 如果未安装,这会在编译时被跳过
      const hasModule = await this.testFrontendLoad();

      if (hasModule) {
        this.isFrontendAvailable = true;
        logger.info("✅ Frontend background removal module available");
        return true;
      }
    } catch (error) {
      // 静默失败 - 这是正常的,库是可选的
    }

    logger.info(
      "ℹ️ Frontend module not available, using backend API exclusively"
    );
    this.isFrontendAvailable = false;
    return false;
  }

  /**
   * 测试前端库加载（延迟加载）
   */
  private async testFrontendLoad(): Promise<boolean> {
    try {
      await import("@imgly/background-removal");
      return true;
    } catch {
      return false;
    }
  }

  /** 浏览器端兜底：限制体积，避免大图画布 OOM */
  private canUseFrontendFallback(imageData: string): boolean {
    const sizeKB = imageData.length / 1024;
    return sizeKB <= 15 * 1024;
  }

  private formatUserError(error?: string): string {
    if (!error) return "抠图失败，请稍后重试";
    const lower = error.toLowerCase();
    if (
      lower.includes("not available") ||
      lower.includes("remove_bg_api_key") ||
      lower.includes("background removal failed")
    ) {
      return "抠图服务暂不可用，请稍后重试或联系管理员";
    }
    return error;
  }

  /**
   * 浏览器端移除背景（后端不可用时的兜底）
   */
  private async removeBackgroundFrontend(
    imageData: string,
    mimeType: string = "image/png"
  ): Promise<BackgroundRemovalResult> {
    const startTime = performance.now();
    try {
      const available = await this.checkFrontendAvailable();
      if (!available) {
        return {
          success: false,
          error: "浏览器抠图模块不可用",
          method: "frontend",
        };
      }

      logger.info("🖥️ Using browser fallback for background removal...");
      const { removeBackground } = await import("@imgly/background-removal");

      const dataUrl = imageData.startsWith("data:")
        ? imageData
        : `data:${mimeType};base64,${imageData}`;

      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const resultBlob = await removeBackground(blob, {
        output: { format: "image/png", quality: 0.8 },
      });

      const resultDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () =>
          reject(reader.error ?? new Error("Failed to read result blob"));
        reader.readAsDataURL(resultBlob);
      });

      const processingTime = Math.round(performance.now() - startTime);
      logger.info(
        `✅ Browser background removal completed in ${processingTime}ms`
      );

      return {
        success: true,
        imageData: resultDataUrl,
        processingTime,
        method: "frontend",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Browser processing failed";
      logger.error("❌ Browser background removal failed:", message);
      return {
        success: false,
        error: message,
        method: "frontend",
      };
    }
  }

  /**
   * 从base64移除背景 - 后端处理
   */
  private async removeBackgroundBackend(
    imageData: string,
    mimeType: string = "image/png"
  ): Promise<BackgroundRemovalResult> {
    try {
      const startTime = performance.now();
      logger.info("🌐 Sending request to backend for background removal...");

      // 使用公开 API 端点（无需认证）
      const response = await fetchWithAuth(
        `${API_BASE}/api/public/ai/remove-background`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageData,
            mimeType,
            source: "base64",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.error || `HTTP ${response.status}`
        );
      }

      const result = await response.json();
      if (!result?.success || typeof result?.imageData !== "string" || !result.imageData) {
        throw new Error(result?.error || "Background removal failed");
      }
      const endTime = performance.now();
      const processingTime = Math.round(endTime - startTime);

      logger.info(
        `✅ Backend background removal completed in ${processingTime}ms`
      );

      return {
        success: true,
        imageData: result.imageData,
        processingTime,
        method: "backend",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Backend processing failed";
      logger.error("❌ Backend background removal failed:", message);
      return {
        success: false,
        error: message,
        method: "backend",
      };
    }
  }

  /**
   * 主方法: 移除背景
   * 优先后端；后端不可用时自动降级到浏览器 @imgly/background-removal。
   */
  async removeBackground(
    imageData: string,
    mimeType: string = "image/png",
    preferFrontend: boolean = true
  ): Promise<BackgroundRemovalResult> {
    try {
      const imageSizeKB = imageData.length / 1024;
      logger.info(
        `📊 Image size: ${imageSizeKB.toFixed(2)}KB, trying backend API first`
      );

      const backendResult = await this.removeBackgroundBackend(
        imageData,
        mimeType
      );
      if (backendResult.success) {
        return backendResult;
      }

      if (
        preferFrontend &&
        this.canUseFrontendFallback(imageData)
      ) {
        logger.warn(
          "⚠️ Backend background removal failed, trying browser fallback...",
          backendResult.error
        );
        const frontendResult = await this.removeBackgroundFrontend(
          imageData,
          mimeType
        );
        if (frontendResult.success) {
          return frontendResult;
        }
        return {
          success: false,
          error: this.formatUserError(
            frontendResult.error || backendResult.error
          ),
        };
      }

      return {
        success: false,
        error: this.formatUserError(backendResult.error),
        method: "backend",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("❌ Background removal failed:", message);
      return {
        success: false,
        error: this.formatUserError(message),
      };
    }
  }

  /**
   * 从URL移除背景 (始终使用后端)
   */
  async removeBackgroundFromUrl(url: string): Promise<BackgroundRemovalResult> {
    try {
      logger.info(`🌐 Removing background from URL: ${url}`);

      const response = await fetchWithAuth(`${API_BASE}/api/public/ai/remove-background`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageData: url,
          source: "url",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result?.success || typeof result?.imageData !== "string" || !result.imageData) {
        throw new Error(result?.error || "Background removal failed");
      }

      logger.info("✅ Background removal from URL completed");

      return {
        success: true,
        imageData: result.imageData,
        method: "backend",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "URL processing failed";
      logger.error("❌ Background removal from URL failed:", message);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * 检查背景移除服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetchWithAuth(
        `${API_BASE}/api/public/ai/background-removal-info`,
        {
          method: "GET",
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取服务信息
   */
  async getInfo() {
    try {
      const response = await fetchWithAuth(
        `${API_BASE}/api/public/ai/background-removal-info`,
        {
          method: "GET",
        }
      );
      if (!response.ok) throw new Error("Failed to fetch info");
      return response.json();
    } catch (error) {
      logger.error("Failed to get background removal info:", error);
      return {
        available: false,
        features: [],
      };
    }
  }
}

// 导出单例
export const backgroundRemovalService = new BackgroundRemovalService();
export default backgroundRemovalService;
