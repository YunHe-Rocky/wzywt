import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "..", "captures");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = "https://ywt.yunhe.ink";

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--disable-gpu", "--hide-scrollbars"],
});

async function preparePage(page, url, waitMs = 4200) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { caret-color: transparent !important; }
      .arena-intro { display: none !important; }
      .arena-ambient { opacity: .8 !important; }
    `,
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

async function captureDesktop(name, pathname, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await preparePage(page, `${baseUrl}${pathname}`, options.waitMs);
  if (options.scrollY) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), options.scrollY);
    await page.waitForTimeout(300);
  }
  const target = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`${name}\t${await page.title()}\t${page.url()}`);
  await context.close();
}

async function captureMobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    colorScheme: "dark",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  await preparePage(page, `${baseUrl}/m?entry=home`, 4600);
  const target = path.join(outputDir, "mobile-home.png");
  await page.screenshot({ path: target, fullPage: false });
  console.log(`mobile-home\t${await page.title()}\t${page.url()}`);
  await context.close();
}

try {
  await captureDesktop("home", "/", { waitMs: 5200 });
  await captureDesktop("tournaments", "/tournaments", { waitMs: 4600 });
  await captureDesktop("heroes", "/heroes", { waitMs: 5200 });
  await captureDesktop("equipment", "/equipment", { waitMs: 5200 });
  await captureDesktop("home-flow", "/", { waitMs: 5200, scrollY: 510 });
  await captureMobile();
} finally {
  await browser.close();
}
