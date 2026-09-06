import { chromium, devices, webkit } from "playwright";

export const browserProfiles = [
  { name: "chromium-desktop", browserType: chromium, options: { viewport: { width: 1280, height: 900 } }, prefix: "" },
  { name: "chromium-android", browserType: chromium, options: devices["Pixel 7"], prefix: "/m" },
  { name: "webkit-iphone", browserType: webkit, options: devices["iPhone 13"], prefix: "/m" },
];

export function selectedProfiles() {
  const names = (process.env.E2E_PROJECTS || browserProfiles.map((profile) => profile.name).join(",")).split(",");
  for (const name of names) {
    if (!browserProfiles.some((profile) => profile.name === name)) throw new Error(`Unknown E2E project: ${name}`);
  }
  return browserProfiles.filter((profile) => names.includes(profile.name));
}

export function launchBrowser(profile) {
  return profile.browserType.launch({
    headless: true,
    // Optional user-selected Chromium executable; WebKit always uses Playwright.
    executablePath: profile.browserType === chromium ? process.env.E2E_BROWSER_PATH || undefined : undefined,
  });
}
