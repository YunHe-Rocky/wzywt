import assert from 'node:assert/strict';

// Samples real composed foreground/background colors; intentionally not a full WCAG claim.
export async function inspectContrast(page, selector) {
  const values = await page.locator(selector).evaluateAll(elements => {
    const parse = value => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || [];
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] ?? 1];
    };
    const blend = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return alpha ? [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha) : [0, 0, 0, 0];
    };
    const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return elements.filter(e => e.checkVisibility()).map(element => {
      let background = [0, 0, 0, 0];
      for (let current = element; current; current = current.parentElement) background = blend(background, parse(getComputedStyle(current).backgroundColor));
      background = blend(background, [255, 255, 255, 1]);
      const foreground = blend(parse(getComputedStyle(element).color), background);
      const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return { text: element.textContent?.trim().slice(0, 80), foreground, background, ratio: (levels[0] + .05) / (levels[1] + .05) };
    });
  });
  assert.ok(values.length, `contrast target exists: ${selector}`);
  for (const value of values) assert.ok(value.ratio >= 4.5, `${selector} ${value.text}: contrast ${value.ratio.toFixed(2)}`);
  return { selector, values };
}

export async function inspectPlayerControls(page) {
  const controls = await page.locator('.match-result-table input,.match-result-table select').evaluateAll(elements => elements.map(e => {
    const r = e.getBoundingClientRect(), cell = e.closest('td').getBoundingClientRect();
    return { label: e.getAttribute('aria-label'), width: r.width, height: r.height, contained: r.left >= cell.left && r.right <= cell.right && r.top >= cell.top && r.bottom <= cell.bottom };
  }));
  assert.ok(controls.length >= 40, 'real editable player fields exist');
  for (const c of controls) assert.ok(c.contained && c.height >= 44 && c.width >= 44, `player control must fit its cell with a 44px target: ${JSON.stringify(c)}`);
}
