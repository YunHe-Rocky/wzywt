import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--hide-scrollbars'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN', colorScheme: 'dark', deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto('https://ywt.yunhe.ink/heroes', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => [...document.querySelectorAll('.hero-catalog-grid img')].filter(img => {
    const r = img.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  }).length >= 6 && [...document.querySelectorAll('.hero-catalog-grid img')].filter(img => {
    const r = img.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  }).every(img => img.complete && img.naturalWidth > 100 && parseFloat(getComputedStyle(img).opacity) >= .99), null, { timeout: 120000 });
  await page.screenshot({ path: path.join(outputDir, 'probe-grid.png') });
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.href,
    links: [...document.querySelectorAll('.hero-catalog-grid button')].slice(0,8).map(a => ({text: a.innerText, label: a.getAttribute('aria-label'), className: a.className})),
    images: [...document.querySelectorAll('.hero-catalog-grid img')].slice(0,12).map(img => ({src: img.currentSrc, width:img.naturalWidth, opacity:getComputedStyle(img).opacity})),
  })), null, 2));
  const first = page.getByRole('button', { name: '查看赵云详情', exact: true });
  await first.click();
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outputDir, 'probe-detail.png') });
  console.log(JSON.stringify(await page.evaluate(() => ({url: location.href, text: document.body.innerText.slice(0,8000), images:[...document.querySelectorAll('img')].map(img =>({src:img.currentSrc,width:img.naturalWidth,opacity:getComputedStyle(img).opacity,rect:img.getBoundingClientRect().toJSON()}))})), null, 2));
} finally {
  await browser.close();
}
