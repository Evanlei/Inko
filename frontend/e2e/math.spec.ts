import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MathASTNode } from '../src/types/math';
import { MATH_PATHS } from '../src/presets/mathInk';

type Observed = typeof window & { mathNodes: MathASTNode[]; textLocations: Record<string, { x: number; y: number }>; exportedPlots: number };
async function observe(page: Page) {
  await page.addInitScript(() => {
    const state = window as Observed, NativeWorker = Worker;
    state.mathNodes = []; state.textLocations = {}; state.exportedPlots = 0;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => { if (event.data.math) state.mathNodes = event.data.math; });
      }
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText, stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, width) {
      const point = new DOMPoint(x, y).matrixTransform(this.getTransform());
      state.textLocations[text] = { x: point.x / devicePixelRatio, y: point.y / devicePixelRatio };
      if (width === undefined) fillText.call(this, text, x, y); else fillText.call(this, text, x, y, width);
    };
    CanvasRenderingContext2D.prototype.stroke = function (...args: [Path2D?]) {
      if (!this.canvas.isConnected && this.strokeStyle === '#6d9d9e') state.exportedPlots++;
      if (args[0]) stroke.call(this, args[0]); else stroke.call(this);
    };
  });
}
async function loadMath(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.getByRole('button', { name: /Oscillator lab/ }).click();
  await expect(page.getByLabel('w result')).toHaveText('2');
}
async function add(page: Page, expression: string) {
  await page.getByRole('button', { name: 'Add equation', exact: true }).first().click();
  await page.getByLabel('New equation').fill(expression);
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await expect(page.getByRole('dialog', { name: 'A little live math.' })).not.toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Math controls' })).toHaveAttribute('aria-busy', 'false');
}
async function updateEquation(page: Page, text: string) {
  await page.getByLabel('Edit equation', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Update equation', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Math controls' })).toHaveAttribute('aria-busy', 'false');
}
test('oscillator variables update dependent results and plots, undo, persist, and export', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await observe(page); await loadMath(page);
  const before = await page.evaluate(() => (window as Observed).mathNodes[3].plot!.samples[50][1]);
  await page.screenshot({ path: 'test-results/inko-math-desktop.png' });
  await page.getByLabel('Variable value').fill('9'); await page.getByRole('button', { name: 'Apply value' }).click();
  await expect(page.getByLabel('w result')).toHaveText('3');
  const after = await page.evaluate(() => (window as Observed).mathNodes[3].plot!.samples);
  expect(after).toHaveLength(200); expect(after[50][1]).not.toBe(before);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByLabel('w result')).toHaveText('2');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.getByLabel('w result')).toHaveText('3');
  await expect(page.getByText('Saved on this device')).toBeVisible(); await page.reload();
  await expect(page.getByLabel('w result')).toHaveText('3');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  expect(await page.evaluate(() => (window as Observed).exportedPlots)).toBe(1);
  expect(await page.locator('canvas').count()).toBe(1); expect(errors).toEqual([]);
});
test('real handwritten math supports live scrubbing, cancellation, commit and undo', async ({ page }) => {
  await observe(page); await page.goto('/'); await expect(page.getByRole('button', { name: 'Pen (P)' })).toBeEnabled();
  for (const [index, token] of [...'k=4'].entries()) for (const path of MATH_PATHS[token]) {
    const points = path.map(([x, y]) => ({ x: 400 + index * 22 + x * 1.5, y: 300 + y * 1.5 }));
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
  }
  await expect(page.getByLabel('k result')).toHaveText('4'); await page.getByRole('button', { name: 'Select (V)' }).click();
  await page.mouse.move(453, 312); await page.mouse.down(); await page.mouse.move(453, 292, { steps: 6 });
  await expect(page.getByLabel('k result')).toHaveText('5');
  await page.keyboard.press('Escape'); await page.mouse.up(); await expect(page.getByLabel('k result')).toHaveText('4');
  await page.mouse.move(453, 312); await page.mouse.down(); await page.mouse.move(453, 292, { steps: 6 }); await page.mouse.up();
  await expect(page.getByLabel('k result')).toHaveText('5');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByLabel('k result')).toHaveText('4');
});
test('typed equations and errors remain editable without breaking drawing or dependencies', async ({ page }) => {
  await observe(page); await page.goto('/'); await add(page, 'k=4'); await add(page, 'w=sqrt(k)');
  await expect(page.getByLabel('w result')).toHaveText('2');
  await page.getByRole('button', { name: 'Select equation 1: k=4', exact: true }).click();
  await updateEquation(page, 'k=1/0'); await expect(page.getByLabel('k result')).toHaveText('Error'); await expect(page.getByLabel('w result')).toHaveText('Error');
  await updateEquation(page, 'k=16'); await expect(page.getByLabel('w result')).toHaveText('4');
  await add(page, 'y(x)=sin(k*x)'); await expect(page.getByLabel('y result')).toHaveText('200 samples');
  await page.getByRole('button', { name: /Select equation 3:/ }).click(); await updateEquation(page, 'y(x)=missing(x)');
  await expect(page.getByLabel('y result')).toHaveText('Error');
  await updateEquation(page, 'y(x)=cos(k*x)'); await expect(page.getByLabel('y result')).toHaveText('200 samples');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Room for anything')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Math controls' })).not.toBeAttached();
  await expect(page.getByRole('button', { name: 'Add equation', exact: true })).toBeEnabled();
});
test('math summaries include a plot preview and reopen the original ink', async ({ page }) => {
  await observe(page); await loadMath(page);
  const before = await page.locator('.board-status > span').nth(1).innerText();
  while (parseInt(await page.locator('.zoom-value').innerText()) > 18) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Semantic overview')).toHaveText('1 workspace · overview');
  await expect.poll(() => page.evaluate(() => !!(window as Observed).textLocations['y(x) · 200 samples'])).toBe(true);
  await page.screenshot({ path: 'test-results/inko-math-overview.png' });
  const point = await page.evaluate(() => (window as Observed).textLocations['Live math']);
  await page.mouse.click(point.x + 30, point.y + 12);
  await expect(page.getByLabel('Semantic overview')).not.toBeAttached();
  await expect(page.locator('.board-status > span').nth(1)).toHaveText(before); await expect(page.getByLabel('w result')).toHaveText('2');
});
test('math controls fit on a phone and numeric editing is touch accessible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const page = await context.newPage();
  await observe(page); await loadMath(page);
  await page.getByLabel('Variable value').fill('-2'); await page.getByRole('button', { name: 'Apply value' }).tap();
  await expect(page.getByLabel('k result')).toHaveText('-2'); await expect(page.getByLabel('w result')).toHaveText('Error');
  await page.getByLabel('Variable value').fill('4'); await page.getByRole('button', { name: 'Apply value' }).tap();
  await expect(page.getByLabel('w result')).toHaveText('2');
  await page.screenshot({ path: 'test-results/inko-math-mobile.png' });
  for (const name of ['Add equation', 'Examples', 'Export PNG', 'Minimize math controls']) {
    const box = await page.getByRole('button', { name, exact: true }).first().boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await context.close();
});

test('graph endpoints survive equation changes in a mixed workspace', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.getByRole('button', { name: /Routing graph/ }).click();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  await add(page, 'k=4'); await add(page, 'w=sqrt(k)');
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByLabel('Start node').selectOption({ label: 'G' }); await page.getByLabel('End node').selectOption({ label: 'A' });
  await page.getByRole('button', { name: 'Math', exact: true }).click();
  await page.getByLabel('Variable value').fill('9'); await page.getByRole('button', { name: 'Apply value' }).click();
  await expect(page.getByLabel('w result')).toHaveText('3');
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByText('No route from G to A')).toBeVisible();
});
