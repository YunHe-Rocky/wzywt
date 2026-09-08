import assert from 'node:assert/strict';

export const auditWidths = (defaults) => process.env.E2E_LAYOUT_WIDTHS
  ? process.env.E2E_LAYOUT_WIDTHS.split(',').map(Number) : defaults;

export async function assertViewportBounds(page, label) {
  const issues = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const problems = [];
    if (document.documentElement.scrollWidth > width + 1) problems.push(`document ${document.documentElement.scrollWidth} > ${width}`);
    for (const el of document.querySelectorAll('main input, main select, main button, main textarea, main h1, main h2, main p, .page-shell input, .page-shell button, .page-shell p, .page-shell h1, [role="dialog"], [role="alertdialog"]')) {
      if (!el.checkVisibility()) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      let scroller = el.parentElement;
      while (scroller && scroller !== document.body) {
        if (['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX) && scroller.scrollWidth > scroller.clientWidth) break;
        scroller = scroller.parentElement;
      }
      // Contents of intentionally scrollable tables/tabs may extend beyond their viewport.
      if (scroller && scroller !== document.body) continue;
      if (!el.matches('input, textarea, select') && getComputedStyle(el).overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1) problems.push(`${el.tagName} content width ${el.scrollWidth} > ${el.clientWidth}: ${el.textContent?.slice(0, 30)}`);
      if (box.left < -1 || box.right > width + 1) problems.push(`${el.tagName}.${el.className} ${el.getAttribute('aria-label') || el.textContent?.slice(0, 24)} [${Math.round(box.left)},${Math.round(box.right)}]`);
      if (el.matches('[role="dialog"], [role="alertdialog"]') && (box.top < -1 || box.bottom > innerHeight + 1)) problems.push(`dialog vertical [${box.top},${box.bottom}] > ${innerHeight}`);
    }
    return problems.slice(0, 12);
  });
  if (process.env.E2E_SCREENSHOT_DIR) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/${label.replace(/[^a-z0-9-]/gi, '-')}-${page.viewportSize().width}.png`, fullPage: true });
  }
  assert.deepEqual(issues, [], `${label}: controls must fit without hidden clipping`);
}
