import { getDeploymentBrand } from "@/config/deploymentBrand";
import { logger } from "@/utils/logger";
import { fetchWithAuth } from "./authFetch";
import { dataUrlToBlob, fileToDataUrl } from "@/utils/imageConcurrency";

export type OssUploadOptions = {
  /** 指定上传的子目录，默认为 `uploads/` */
  dir?: string;
  /** 最大允许尺寸，默认 32MB（由后端 presign 默认值决定） */
  maxSize?: number;
  /** 建议文件名（用于推断后缀） */
  fileName?: string;
  /** 当前项目 ID，用于自动归档到项目目录 */
  projectId?: string | null;
  /** 指定 content-type */
  contentType?: string;
  /** 指定 OSS key（覆盖自动生成） */
  key?: string;
  /** 可选：显式透传 access token（供 Worker 使用） */
  authToken?: string;
};

export type OssUploadResult = {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
  size?: number;
};

// 全新的预签名返回值类型
type PresignPutResponse = {
  uploadUrl: string;
  publicUrl: string;
  mode?: "tos" | "local";
  key?: string;
};

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL &&
    import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
    : "http://localhost:4000";
}

/**
 * 前端也可强制指定；优先以后端 presign 返回的 mode 为准。
 * - 显式 `VITE_UPLOAD_MODE` 优先
 * - 未配置时：linglong 品牌默认走后端 multipart 本地落盘（不直传 COS/TOS）
 */
function isFrontendLocalUploadMode(): boolean {
  const raw = String(
    (import.meta.env.VITE_UPLOAD_MODE as string | undefined) || "",
  )
    .trim()
    .toLowerCase();
  if (raw === "local" || raw === "disk" || raw === "nginx") return true;
  if (raw === "tos" || raw === "oss" || raw === "s3" || raw === "cos") {
    return false;
  }
  return getDeploymentBrand() === "linglong";
}

function isBackendImageRelayEnabled(): boolean {
  if (isFrontendLocalUploadMode()) return true;
  const raw = String(
    (import.meta.env.VITE_IMAGE_UPLOAD_BACKEND_RELAY as string | undefined) || "",
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
function normalizeDir(baseDir: string | undefined, projectId?: string | null) {
  const trimmed = baseDir?.trim();
  if (trimmed) return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  if (projectId) return `projects/${projectId}/assets/`;
  return "uploads/";
}

function inferExtension(fileName?: string, contentType?: string) {
  if (fileName && fileName.includes(".")) {
    return fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  }
  if (contentType) {
    const map: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "model/gltf-binary": ".glb",
      "model/gltf+json": ".gltf",
      "application/json": ".json",
      "text/plain": ".txt",
      "application/x-subrip": ".srt",
      "text/srt": ".srt",
    };
    if (map[contentType]) return map[contentType];
  }
  return "";
}

export function dataURLToBlob(dataURL: string): Blob {
  // 🔧 修复：处理重复的 data URL 前缀（如 "data:image/png;base64,data:image/png;base64,xxx"）
  let normalizedDataURL = dataURL;

  // 检测并修复重复前缀：如果 split(',') 后的 raw 部分仍然以 "data:" 开头，说明有重复前缀
  const firstSplit = dataURL.split(",");
  if (firstSplit.length >= 2 && firstSplit[1].startsWith("data:")) {
    // 使用第二个 data URL 部分作为实际数据
    normalizedDataURL = firstSplit.slice(1).join(",");
    logger.warn("检测到重复的 data URL 前缀，已自动修复");
  }

  const [meta, raw] = normalizedDataURL.split(",");
  const isBase64 = meta.includes(";base64");
  const mimeMatch = /data:([^;]+)/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  if (isBase64) {
    const binary = atob(raw);
    const len = binary.length;
    const array = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }
  return new Blob([decodeURIComponent(raw)], { type: mime });
}

export async function dataURLToBlobAsync(dataURL: string): Promise<Blob> {
  try {
    return await dataUrlToBlob(dataURL);
  } catch {
    // 兜底：极端情况下 fetch(data:) 不可用时回退到同步解码
    return dataURLToBlob(dataURL);
  }
}

// 全新的获取 PUT 预签名链接方法
async function requestPresignPutUrl(
  key: string,
  contentType?: string,
  authToken?: string
): Promise<PresignPutResponse> {
  const API_BASE = getApiBaseUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  
  const res = await fetchWithAuth(`${API_BASE}/api/uploads/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({ key, contentType }),
    auth: authToken ? "omit" : "auto",
    credentials: authToken ? "omit" : "include",
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || data?.message || "获取上传凭证失败");
  }
  return data as PresignPutResponse;
}

function isLikelyImageUpload(data: Blob | File, options: OssUploadOptions): boolean {
  const type = String(options.contentType || (data as File).type || "").toLowerCase();
  return type.startsWith("image/");
}

async function verifyUploadedAssetReadable(
  key: string | undefined,
  url: string | undefined,
  authToken?: string
): Promise<boolean> {
  const API_BASE = getApiBaseUrl();
  const relativeTarget = key
    ? `/api/assets/proxy?key=${encodeURIComponent(key)}`
    : url
      ? `/api/assets/proxy?url=${encodeURIComponent(url)}`
      : "";
  const absoluteTarget = key
    ? `${API_BASE}/api/assets/proxy?key=${encodeURIComponent(key)}`
    : url
      ? `${API_BASE}/api/assets/proxy?url=${encodeURIComponent(url)}`
      : "";
  const candidates: string[] = [];
  if (relativeTarget) candidates.push(relativeTarget);
  if (absoluteTarget && absoluteTarget !== relativeTarget) candidates.push(absoluteTarget);
  if (candidates.length === 0) return false;

  const headers: Record<string, string> = { Range: "bytes=0-0" };
  const attempts = [0, 250, 600, 1200];

  for (const delayMs of attempts) {
    if (delayMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    }

    for (const checkTarget of candidates) {
      try {
        // /api/assets/proxy 是公开读接口。这里必须禁用凭证，否则跨域绝对地址
        // 会触发浏览器拦截：Access-Control-Allow-Origin=* 不能搭配 credentials=include。
        const res = await fetch(checkTarget, {
          method: "GET",
          headers,
          credentials: "omit",
          cache: "no-store",
        });
        if (res.ok || res.status === 206) return true;
      } catch {
        // try next target / retry after short propagation delay
      }
    }
  }
  return false;
}

async function uploadFileViaBackend(
  data: Blob | File,
  options: OssUploadOptions,
  fallbackKey?: string,
  endpoint: "image" | "file" = "file",
): Promise<OssUploadResult> {
  const API_BASE = getApiBaseUrl();
  const fileName = options.fileName || "upload";
  const file =
    data instanceof File
      ? data
      : new File([data], fileName, {
          type: options.contentType || (data as File).type || "application/octet-stream",
        });
  const formData = new FormData();
  formData.append("file", file);
  if (options.dir) formData.append("dir", options.dir);
  if (fileName) formData.append("fileName", fileName);
  if (fallbackKey) formData.append("key", fallbackKey);

  const headers: Record<string, string> = {};
  if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;

  try {
    const res = await fetchWithAuth(`${API_BASE}/api/uploads/${endpoint}`, {
      method: "POST",
      body: formData,
      headers,
      auth: options.authToken ? "omit" : "auto",
      credentials: options.authToken ? "omit" : "include",
    });
    const dataJson = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        error:
          dataJson?.message ||
          dataJson?.error ||
          `Backend upload failed: ${res.status}`,
      };
    }

    const url = typeof dataJson?.url === "string" ? dataJson.url : "";
    const key = typeof dataJson?.key === "string" ? dataJson.key : "";
    if (!url && !key) {
      return { success: false, error: "Backend upload returned empty url/key" };
    }
    return {
      success: true,
      url: url || undefined,
      key: key || undefined,
      size: data.size,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Backend upload failed",
    };
  }
}

async function uploadImageViaBackend(
  data: Blob | File,
  options: OssUploadOptions,
  fallbackKey?: string,
): Promise<OssUploadResult> {
  return uploadFileViaBackend(data, options, fallbackKey, "image");
}

function buildKey(dir: string, fileName?: string, extensionHint?: string) {
  const ext = inferExtension(fileName, undefined) || extensionHint || "";
  const safeName = fileName?.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const finalName = safeName
    ? `${timestamp}_${random}_${safeName}`
    : `${timestamp}_${random}${ext}`;
  return `${dir}${finalName}`;
}

export function generateOssKey(
  options: Pick<OssUploadOptions, "dir" | "projectId" | "fileName" | "contentType">
): { dir: string; key: string } {
  const dir = normalizeDir(options.dir, options.projectId);
  const extension = inferExtension(options.fileName, options.contentType);
  return { dir, key: buildKey(dir, options.fileName, extension) };
}

export async function uploadToOSS(
  data: Blob | File,
  options: OssUploadOptions = {}
): Promise<OssUploadResult> {
  try {
    const dir = normalizeDir(options.dir, options.projectId);
    const isImage = isLikelyImageUpload(data, options);
    const mimeType = options.contentType || (data as File).type || "application/octet-stream";
    const extension = inferExtension(options.fileName, mimeType);

    // 1. 提前确定最终的文件 Key (这是使用 S3 PUT 直传的前提)
    const key = (() => {
      const forced = typeof options.key === "string" ? options.key.trim() : "";
      if (forced) return forced.replace(/^\/+/, "");
      return buildKey(dir, options.fileName, extension);
    })();

    // 优先走后端中转：本地上传模式 / 显式 relay / 图片且配置开启
    if (isFrontendLocalUploadMode() || (isImage && isBackendImageRelayEnabled())) {
      const backendUpload = await uploadFileViaBackend(
        data,
        { ...options, dir },
        key,
        isImage ? "image" : "file",
      );
      if (backendUpload.success && (backendUpload.url || backendUpload.key)) {
        const backendReadable = await verifyUploadedAssetReadable(
          backendUpload.key,
          backendUpload.url,
          options.authToken,
        );
        if (backendReadable || isFrontendLocalUploadMode()) {
          // 本地模式：proxy 已能读盘即可；若 nginx 尚未同步，仍以写入成功为准
          if (backendReadable || backendUpload.url || backendUpload.key) {
            return backendUpload;
          }
        }
        if (!backendReadable && !isFrontendLocalUploadMode()) {
          return {
            success: false,
            error: "Backend image upload succeeded but asset is still not readable",
          };
        }
        return backendUpload;
      }
      if (isFrontendLocalUploadMode()) {
        return {
          success: false,
          error: backendUpload.error || "Local upload failed",
        };
      }
      logger.warn("Backend image upload failed, fallback to direct OSS upload", {
        error: backendUpload.error,
      });
    }

    // --- TOS/S3 标准 PUT 直传逻辑 ---

    // 2. 向后端请求针对该 Key 的专属 PUT 预签名链接
    const presignData = await requestPresignPutUrl(key, mimeType, options.authToken);

    // 后端声明 local：改走 multipart，不再 PUT 空 uploadUrl
    if (presignData.mode === "local" || !presignData.uploadUrl) {
      const backendUpload = await uploadFileViaBackend(
        data,
        { ...options, dir },
        key,
        isImage ? "image" : "file",
      );
      if (backendUpload.success) return backendUpload;
      return {
        success: false,
        error: backendUpload.error || "Local upload failed",
      };
    }

    // 3. 将二进制文件直接 PUT 到预签名链接 (彻底抛弃 FormData)
    const fileToUpload = data instanceof File 
      ? data 
      : new File([data], options.fileName || "upload", { type: mimeType });

    const uploadResp = await fetchWithAuth(presignData.uploadUrl, {
      method: "PUT",
      body: fileToUpload,
      headers: {
        "Content-Type": mimeType,
      },
      auth: "omit",
      allowRefresh: false,
      credentials: "omit",
    });

    if (!uploadResp.ok) {
      const text = await uploadResp.text();
      throw new Error(`OSS 上传失败: ${uploadResp.status} ${text || ""}`.trim());
    }

    const publicUrl = presignData.publicUrl;

    // 4. 上传完成后的可读性双重校验
    if (isLikelyImageUpload(data, options)) {
      const readable = await verifyUploadedAssetReadable(key, publicUrl, options.authToken);
      if (!readable) {
        logger.warn("OSS direct upload returned success but asset is not readable", {
          key,
          publicUrl,
        });
        if (isBackendImageRelayEnabled()) {
          const backendUpload = await uploadImageViaBackend(data, options, key);
          if (backendUpload.success && backendUpload.url) {
            const backendReadable = await verifyUploadedAssetReadable(
              backendUpload.key,
              backendUpload.url,
              options.authToken
            );
            if (backendReadable) return backendUpload;
            return {
              success: false,
              error: "Backend image upload succeeded but asset is still not readable",
            };
          }
          return {
            success: false,
            error: backendUpload.error || "Image upload fallback failed",
          };
        }
        return {
          success: false,
          error: "Image uploaded but remote asset is not readable",
        };
      }
    }
    
    return {
      success: true,
      url: publicUrl,
      key,
      size: data.size,
    };
  } catch (error: any) {
    logger.error("OSS 上传失败:", error);
    return {
      success: false,
      error: error?.message || "OSS 上传失败",
    };
  }
}

export async function getImageDimensions(
  file: File | Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.width, height: img.height };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function fileToDataURL(
  file: File | Blob,
  mimeType?: string
): Promise<string> {
  if (file instanceof File && mimeType && file.type !== mimeType) {
    // 直接读取即可，mimeType 信息由 File 自身提供
  }
  return await fileToDataUrl(file);
}

export const ossUploadService = {
  uploadToOSS,
  dataURLToBlob,
  dataURLToBlobAsync,
  getImageDimensions,
  fileToDataURL,
};
