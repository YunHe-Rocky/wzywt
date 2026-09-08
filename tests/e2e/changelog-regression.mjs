import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { auditWidths, assertViewportBounds } from './viewport-bounds.mjs';

// Real pages and navigation; intercept APIs to avoid touching any database.
const base = process.env.E2E_BASE_URL || 'http://localhost:8001';
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
try {
  for (const width of auditWidths([1280, 390, 320])) {
    const mobile = width < 600;
    const prefix = mobile ? '/m' : '';
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce',
      ...(mobile ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } : {}) });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(60000);
    let mode = 'list';
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/changelog') {
        if (url.searchParams.get('slug') === '版本更新') return reply({ content: '# 超管发布的更新\n\n修复战术底图。\n\n[完整版本链接](https://example.com/)\n\n' + 'ReleaseNotes'.repeat(20) + '\n\n`' + 'long-inline-code-'.repeat(18) + '`' });
        if (mode === 'error') return reply({ error: '加载失败' }, 500);
        return reply({ entries: mode === 'empty' ? [] : [{ slug: '版本更新', date: '2026-09-08', title: '超管发布的更新', version: 'v1.0.1', desc: '房间与战术功能修复' }] });
      }
      if (url.pathname === '/api/auth/me') return reply({ user: null });
      return reply({ announcements: [], latestVersion: null });
    });
    await page.goto(`${base}${prefix}/changelog`, { waitUntil: 'domcontentloaded' });
    const entry = page.getByRole('link', { name: '超管发布的更新', exact: true });
    await entry.waitFor();
    assert.equal(await entry.getAttribute('href'), `${prefix}/changelog/${encodeURIComponent('版本更新')}`);
    await page.getByText('房间与战术功能修复', { exact: true }).waitFor();
    await page.getByText('v1.0.1', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await entry.click();
    await page.getByRole('heading', { name: '超管发布的更新', exact: true }).waitFor();
    await page.getByText('修复战术底图。', { exact: true }).waitFor();
    await assertViewportBounds(page, 'changelog-long-content');
    mode = 'empty';
    await page.goto(`${base}${prefix}/changelog`, { waitUntil: 'domcontentloaded' });
    await page.getByText('暂无已发布的更新日志', { exact: true }).waitFor();
    mode = 'error';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('alert').filter({ hasText: '更新日志加载失败' }).waitFor();
    mode = 'list';
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await entry.waitFor();
    console.log(`PASS ${width}px published changelog, detail navigation, empty state and error retry`);
    await context.close();
  }
} finally { await browser.close(); }
