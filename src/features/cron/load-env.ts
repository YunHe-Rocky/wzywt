import { createRequire } from "node:module";

// Cron is launched by `tsx`, outside Next.js, so it must load the shared env.
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");
loadEnvConfig(process.cwd());
