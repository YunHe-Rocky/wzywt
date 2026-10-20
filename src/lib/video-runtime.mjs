import { execFile } from "node:child_process";

let cached;
/** Shared by deployment checks and upload admission; never invokes a shell. */
export function checkVideoRuntime(binary = process.env.FFMPEG_BIN?.trim() || "ffmpeg") {
  if (cached?.binary === binary && cached.until > Date.now()) return cached.promise;
  const promise = new Promise((resolve, reject) => {
    execFile(binary, ["-hide_banner", "-encoders"], { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error || !/\blibx264\b/.test(stdout) || !/\baac\b/.test(stdout)) {
        reject(new Error("FFmpeg with libx264 and AAC encoders is required"));
      } else resolve(binary);
    });
  });
  cached = { binary, until: Date.now() + 60000, promise };
  void promise.catch(() => { if (cached?.promise === promise) cached = undefined; });
  return promise;
}
