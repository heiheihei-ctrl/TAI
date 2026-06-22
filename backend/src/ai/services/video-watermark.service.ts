import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { OssService } from "../../oss/oss.service";
import type OSS from "ali-oss";
import { createFullTiledWatermarkOverlay } from "./tiled-watermark.util";

interface VideoWatermarkOptions {
  text?: string;
  timeoutMs?: number;
  ossKey?: string;
}

@Injectable()
export class VideoWatermarkService {
  private readonly logger = new Logger(VideoWatermarkService.name);
  private readonly DEFAULT_TEXT = "TAI";
  private readonly DEFAULT_TIMEOUT = 180_000;

  constructor(private readonly oss: OssService) {}

  private async probeVideoSize(
    sourceUrl: string,
    timeoutMs: number
  ): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const ffprobe = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height",
          "-of",
          "csv=s=x:p=0",
          sourceUrl,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      ffprobe.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      const timer = setTimeout(() => {
        ffprobe.kill("SIGKILL");
        resolve(null);
      }, Math.min(timeoutMs, 30_000));

      ffprobe.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });

      ffprobe.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          resolve(null);
          return;
        }

        const [widthRaw, heightRaw] = stdout.trim().split("x");
        const width = Number(widthRaw);
        const height = Number(heightRaw);
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          resolve({ width, height });
          return;
        }
        resolve(null);
      });
    });
  }

  /**
   * 为视频添加 45° 平铺图片/文字水印，并上传至 OSS
   */
  async addWatermarkAndUpload(
    sourceUrl: string,
    options?: VideoWatermarkOptions
  ): Promise<{ url: string; key: string; durationMs: number }> {
    const started = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT;
    const key =
      options?.ossKey ||
      `videos/watermarked/${this.buildDatePrefix()}/video-${this.safeRandomId()}.mp4`;

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `watermark-${this.safeRandomId()}.mp4`);
    const overlayTemp = path.join(tempDir, `watermark-overlay-${this.safeRandomId()}.png`);

    const dimensions =
      (await this.probeVideoSize(sourceUrl, timeoutMs)) ?? {
        width: 1920,
        height: 1080,
      };

    const overlayBuffer = await createFullTiledWatermarkOverlay(
      dimensions.width,
      dimensions.height,
      { text: options?.text || this.DEFAULT_TEXT }
    );

    if (!overlayBuffer) {
      this.logger.warn("无法生成平铺水印图层，回退到文字水印");
      return this.addTextWatermarkAndUpload(sourceUrl, options);
    }

    fs.writeFileSync(overlayTemp, overlayBuffer);

    const filterComplex = "[1:v][0:v]scale2ref[wm][base];[base][wm]overlay=0:0";

    const ffArgs = [
      "-y",
      "-i",
      sourceUrl,
      "-i",
      overlayTemp,
      "-filter_complex",
      filterComplex,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      tempFile,
    ];

    this.logger.log(`🎥 Start tiled video watermarking -> temp: ${tempFile}`);

    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", ffArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        const stderrChunks: Buffer[] = [];
        ffmpeg.stderr?.on("data", (chunk) => {
          if (stderrChunks.length < 30) stderrChunks.push(Buffer.from(chunk));
        });

        const timeout = setTimeout(() => {
          ffmpeg.kill("SIGKILL");
          reject(new ServiceUnavailableException("ffmpeg timeout"));
        }, timeoutMs);

        ffmpeg.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        ffmpeg.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            const stderr = Buffer.concat(stderrChunks).toString("utf8");
            reject(
              new ServiceUnavailableException(
                `ffmpeg exited with code ${code}${
                  stderr ? `: ${stderr.slice(-500)}` : ""
                }`
              )
            );
          }
        });
      });

      if (!fs.existsSync(tempFile)) {
        throw new ServiceUnavailableException("ffmpeg 未生成输出文件");
      }

      this.logger.log(`🎥 Uploading watermarked video to OSS: ${key}`);
      const fileStream = fs.createReadStream(tempFile);
      const uploadOptions: OSS.PutStreamOptions = {
        mime: "video/mp4",
        timeout: 120000,
        meta: { uid: 0, pid: 0 },
        callback: undefined as unknown as OSS.ObjectCallback,
      };
      const { url } = await this.oss.putStream(key, fileStream, uploadOptions);

      const elapsed = Date.now() - started;
      this.logger.log(
        `✅ Video watermarked and uploaded: ${key} (${elapsed}ms)`
      );
      return { url, key, durationMs: elapsed };
    } finally {
      for (const file of [tempFile, overlayTemp]) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch {
          this.logger.warn(`清理临时文件失败: ${file}`);
        }
      }
    }
  }

  /**
   * 将原始视频无水印上传到 OSS（仅做转存，确保可跨域访问）
   */
  async uploadOriginalToOSS(
    sourceUrl: string,
    options?: VideoWatermarkOptions
  ): Promise<{ url: string; key: string; durationMs: number }> {
    const started = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT;
    const key =
      options?.ossKey ||
      `videos/raw/${this.buildDatePrefix()}/video-${this.safeRandomId()}.mp4`;

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `raw-${this.safeRandomId()}.mp4`);

    // 纯复制流（不加水印），保持原视频编码，开启 faststart 方便前端加载
    const ffArgs = [
      "-y",
      "-i",
      sourceUrl,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      tempFile,
    ];

    this.logger.log(`🎥 Start passthrough upload -> temp: ${tempFile}`);

    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", ffArgs, {
          stdio: ["ignore", "ignore", "pipe"],
        });

        const stderrChunks: Buffer[] = [];
        ffmpeg.stderr?.on("data", (chunk) => {
          if (stderrChunks.length < 10) stderrChunks.push(Buffer.from(chunk));
        });

        const timer = setTimeout(() => {
          ffmpeg.kill("SIGKILL");
          reject(new ServiceUnavailableException("ffmpeg timeout"));
        }, timeoutMs);

        ffmpeg.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });

        ffmpeg.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve();
          } else {
            const stderr = Buffer.concat(stderrChunks).toString("utf8");
            reject(
              new ServiceUnavailableException(
                `ffmpeg exited with code ${code}${
                  stderr ? `: ${stderr.slice(-400)}` : ""
                }`
              )
            );
          }
        });
      });

      if (!fs.existsSync(tempFile)) {
        throw new ServiceUnavailableException("ffmpeg 未生成输出文件");
      }

      this.logger.log(`🎥 Uploading raw video to OSS: ${key}`);
      const { url } = await this.oss.putStream(
        key,
        fs.createReadStream(tempFile),
        {
          mime: "video/mp4",
          timeout: 120000,
          meta: { uid: 0, pid: 0 },
          callback: undefined as unknown as OSS.ObjectCallback,
        }
      );

      const elapsed = Date.now() - started;
      this.logger.log(
        `✅ Video uploaded without watermark: ${key} (${elapsed}ms)`
      );
      return { url, key, durationMs: elapsed };
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {
        this.logger.warn(`清理临时文件失败: ${tempFile}`);
      }
    }
  }

  /**
   * 回退方案：使用文字水印（当图片水印不可用时）
   */
  private async addTextWatermarkAndUpload(
    sourceUrl: string,
    options?: VideoWatermarkOptions
  ): Promise<{ url: string; key: string; durationMs: number }> {
    const started = Date.now();
    const text = (options?.text || this.DEFAULT_TEXT).replace(/'/g, "\\'");
    const timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT;
    const key =
      options?.ossKey ||
      `videos/watermarked/${this.buildDatePrefix()}/video-${this.safeRandomId()}.mp4`;

    // 构造 drawtext 滤镜，字号按视频高度动态 3.5%，右下角内缩 20px
    const drawtext = `drawtext=text='${text}':fontcolor=white@0.75:fontsize=h*0.035:x=w-tw-20:y=h-th-20:font=sans-serif`;

    const ffArgs = [
      "-y",
      "-i",
      sourceUrl,
      "-vf",
      drawtext,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "pipe:1",
    ];

    this.logger.log(
      `🎥 Start video text watermarking (fallback) -> OSS: ${key}`
    );

    const ffmpeg = spawn("ffmpeg", ffArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr?.on("data", (chunk) => {
      if (stderrChunks.length < 20) stderrChunks.push(Buffer.from(chunk));
    });

    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
    }, timeoutMs);

    const uploadOptions: OSS.PutStreamOptions = {
      mime: "video/mp4",
      timeout: 120000,
      meta: { uid: 0, pid: 0 },
      callback: undefined as unknown as OSS.ObjectCallback,
    };
    const uploadPromise = this.oss.putStream(key, ffmpeg.stdout, uploadOptions);

    const exitPromise = new Promise<void>((resolve, reject) => {
      ffmpeg.on("error", (err) => reject(err));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          const stderr = Buffer.concat(stderrChunks).toString("utf8");
          reject(
            new ServiceUnavailableException(
              `ffmpeg exited with code ${code}${stderr ? `: ${stderr}` : ""}`
            )
          );
        }
      });
    });

    try {
      await Promise.all([uploadPromise, exitPromise]);
      const elapsed = Date.now() - started;
      if (timeout) clearTimeout(timeout);
      const { url } = await uploadPromise;
      this.logger.log(
        `✅ Video text watermarked and uploaded: ${key} (${elapsed}ms)`
      );
      return { url, key, durationMs: elapsed };
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      this.logger.warn(`❌ Video text watermark failed for ${key}: ${error}`);
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      ffmpeg.stdout?.removeAllListeners();
      ffmpeg.stderr?.removeAllListeners();
    }
  }

  private buildDatePrefix(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  private safeRandomId(): string {
    return (randomUUID?.() || Math.random().toString(16).slice(2, 10)).replace(
      /-/g,
      ""
    );
  }
}
