import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
test.use({ hasTouch: true });

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    const state = window as typeof window & { inkText: Record<string, { x: number; y: number; alpha: number }>; exportText: string[] };
    state.inkText = {}; state.exportText = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      const point = new DOMPoint(x, y).matrixTransform(this.getTransform());
      state.inkText[text] = { x: point.x / devicePixelRatio, y: point.y / devicePixelRatio, alpha: this.globalAlpha };
      if (!this.canvas.isConnected) state.exportText.push(text);
      if (maxWidth === undefined) original.call(this, text, x, y); else original.call(this, text, x, y, maxWidth);
    };
  });
}
async function loadOverview(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.getByRole('button', { name: /Routing graph/ }).click();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  const zoom = page.locator('.zoom-value');
  while (parseInt(await zoom.innerText()) > 18) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Semantic overview')).toHaveText('1 workspace · overview');
  await expect.poll(() => text(page, 'Shortest path · 11')).toMatchObject({ alpha: 1 });
}
async function text(page: Page, value: string) {
  return page.evaluate((key) => (window as typeof window & { inkText: Record<string, { x: number; y: number; alpha: number }> }).inkText[key], value);
}
test('overview draws live summaries on one canvas, opens without editing ink, and survives undo and reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await instrument(page); await loadOverview(page);
  const before = await page.locator('.board-status > span').nth(1).innerText();
  await page.screenshot({ path: 'test-results/inko-semantic-desktop.png' });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  const exported = await page.evaluate(() => (window as typeof window & { exportText: string[] }).exportText);
  expect(exported).toContain('A'); expect(exported).not.toContain('Routing graph'); expect(exported).not.toContain('Shortest path · 11');
  await page.getByRole('button', { name: 'Expand graph controls' }).click();
  await page.getByLabel('Edit connection').selectOption({ label: 'A → B · 4' });
  await page.getByLabel('Connection weight').fill('20'); await page.getByRole('button', { name: 'Apply weight' }).click();
  await expect.poll(() => text(page, 'Shortest path · 12')).toMatchObject({ alpha: 1 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Graph controls', exact: true })).toHaveAttribute('aria-busy', 'false');
  const title = await text(page, 'Routing graph');
  await page.mouse.click(title.x + 30, title.y + 12);
  await expect(page.getByLabel('Semantic overview')).not.toBeAttached();
  await expect(page.locator('.board-status > span').nth(1)).toHaveText(before);
  expect(await page.locator('canvas').count()).toBe(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Room for anything')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible(); await page.reload();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  expect(errors).toEqual([]);
});
test('overview supports touch exploration and keyboard zoom restores detail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await instrument(page); await loadOverview(page);
  await page.screenshot({ path: 'test-results/inko-semantic-mobile.png' });
  const title = await text(page, 'Routing graph');
  const before = await page.locator('.board-status > span').nth(1).innerText();
  await page.touchscreen.tap(title.x + 30, title.y + 12);
  await expect(page.getByLabel('Semantic overview')).not.toBeAttached();
  await expect(page.locator('.board-status > span').nth(1)).toHaveText(before);
  while (parseInt(await page.locator('.zoom-value').innerText()) > 18) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Semantic overview')).toBeVisible();
  await page.locator('canvas').focus(); await page.keyboard.press('1');
  await expect(page.getByLabel('Semantic overview')).not.toBeAttached();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
});
