import nextEnv from "@next/env";
import { checkVideoRuntime } from "../src/lib/video-runtime.mjs";

nextEnv.loadEnvConfig(process.cwd());
try {
  await checkVideoRuntime();
  console.log("Video runtime ready: FFmpeg, libx264 and AAC encoders available.");
} catch {
  console.error("Video runtime unavailable: install FFmpeg with libx264/AAC and optionally set FFMPEG_BIN. No video was published.");
  process.exitCode = 1;
}
