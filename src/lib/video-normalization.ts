import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { MediaStorage, StreamStoredObjectInfo } from "@/lib/storage";
import { ServiceError } from "@/lib/service-error";
import { inspectVideoDuration } from "@/lib/video-duration";
import { checkVideoRuntime } from "@/lib/video-runtime.mjs";

export async function assertVideoRuntime(): Promise<void> {
  try { await checkVideoRuntime(); }
  catch { throw new ServiceError("SERVICE_UNAVAILABLE", "服务器视频处理组件 FFmpeg 不可用，请联系管理员安装含 libx264/AAC 的版本"); }
}

export interface VideoNormalizationOptions {
  maxBytes: number;
  maxDurationSeconds: number;
  signal: AbortSignal;
}

/** Decode before publication; a valid container and duration do not prove playback. */
export async function normalizeCombatVideo(
  storage: MediaStorage, key: string, mimeType: string, options: VideoNormalizationOptions,
): Promise<StreamStoredObjectInfo> {
  if (!storage.saveStream) throw new ServiceError("SERVICE_UNAVAILABLE", "媒体存储不支持视频处理");
  const directory = await mkdtemp(join(tmpdir(), "wzywt-video-"));
  const input = join(directory, "input");
  const output = join(directory, "playback.mp4");
  let saved: StreamStoredObjectInfo | undefined;
  try {
    await pipeline(await storage.open(key), createWriteStream(input, { flags: "wx" }), { signal: options.signal });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.env.FFMPEG_BIN?.trim() || "ffmpeg", [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-xerror",
        "-protocol_whitelist", "file,pipe", "-f", mimeType === "video/webm" ? "matroska" : "mov", "-i", input,
        "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1",
        "-t", String(options.maxDurationSeconds + 1), "-threads", "1", "-filter_threads", "1",
        "-vf", "scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h='if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-level:v", "3.1",
        "-crf", "25", "-maxrate", "1500k", "-bufsize", "3000k", "-g", "60",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-ar", "44100",
        "-movflags", "+faststart", "-y", output,
      ], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      // Drain stderr without retaining user data or unbounded decoder diagnostics.
      child.stderr.resume();
      let timedOut = false, tooLarge = false;
      const abort = () => child.kill("SIGKILL");
      const timer = setTimeout(() => { timedOut = true; abort(); }, 180_000);
      // -fs silently produces a shorter valid movie; exceeding size must fail.
      const sizeTimer = setInterval(() => {
        void stat(output).then(info => { if (info.size > options.maxBytes) { tooLarge = true; abort(); } }).catch(() => undefined);
      }, 250);
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.signal.aborted) abort();
      const cleanup = () => { clearTimeout(timer); clearInterval(sizeTimer); options.signal.removeEventListener("abort", abort); };
      child.once("error", error => {
        cleanup();
        reject(new ServiceError("SERVICE_UNAVAILABLE", (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "服务器未安装视频处理组件 FFmpeg，请联系管理员完成安装后重试"
          : "服务器无法启动视频处理，请稍后重试"));
      });
      child.once("close", code => {
        cleanup();
        if (tooLarge) reject(new ServiceError("PAYLOAD_TOO_LARGE", "处理后的视频超过文件大小限制"));
        else if (options.signal.aborted || timedOut) reject(new ServiceError("REQUEST_TIMEOUT", "视频处理已中断或超时，请重试"));
        else if (code !== 0) reject(new ServiceError("UNSUPPORTED_MEDIA_TYPE", "视频无法完整解码，请重新导出或录制后上传"));
        else resolve();
      });
    });
    const info = await stat(output);
    if (!info.size || info.size > options.maxBytes) throw new ServiceError("PAYLOAD_TOO_LARGE", "处理后的视频超过文件大小限制");
    options.signal.throwIfAborted();
    saved = await storage.saveStream({ namespace: "post-videos", extension: "mp4", data: createReadStream(output) });
    const duration = await inspectVideoDuration(storage, saved.key, saved.size, "video/mp4");
    options.signal.throwIfAborted();
    // -t bounds work on malicious or incorrectly declared source durations.
    // Resampling to 30 fps and AAC packet boundaries can add a fraction of a
    // frame. Keep the strict source check and tolerate only this muxing margin.
    if (duration > options.maxDurationSeconds + 0.1) throw new ServiceError("VALIDATION_ERROR", `视频时长不能超过 ${options.maxDurationSeconds} 秒`);
    return saved;
  } catch (error) {
    if (saved) await storage.delete(saved.key).catch(() => undefined);
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
