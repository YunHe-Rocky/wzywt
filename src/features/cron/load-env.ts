import nextEnv from "@next/env";

// Cron is launched by `tsx`, outside Next.js, so it must load the shared env.
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
