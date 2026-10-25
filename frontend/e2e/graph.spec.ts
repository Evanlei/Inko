import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DIGIT_PATHS } from '../src/presets/digits';

async function drawPath(page: Page, points: { x: number; y: number }[]) {
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
}
async function loadGraph(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Routing graph', exact: true }).click();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  await expect(page.getByLabel('Graph controls')).toHaveAttribute('aria-busy', 'false');
}
test('the routing demo runs Dijkstra, updates weights, undoes changes, and survives reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await loadGraph(page);
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Route value')).toHaveText('11');
  await expect(page.getByText('Shortest path A → B → E → F → G · cost 11')).toBeVisible();
  await page.getByLabel('Edit connection').selectOption({ label: 'A → B · 4' });
  await page.getByLabel('Connection weight').fill('20'); await page.getByRole('button', { name: 'Apply weight' }).click();
  await expect(page.getByLabel('Route value')).toHaveText('12');
  await expect(page.getByText('Shortest path A → C → E → F → G · cost 12')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Graph controls')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Route value')).toHaveText('11');
  await page.getByLabel('Connection weight').fill('6'); await page.getByRole('button', { name: 'Apply weight' }).click();
  await expect(page.getByText('Saved on this device')).toBeVisible(); await page.reload();
  await expect(page.getByText('7 nodes · 11 connections')).toBeVisible();
  await page.getByLabel('Edit connection').selectOption({ label: 'A → B · 6' });
  await expect(page.getByLabel('Connection weight')).toHaveValue('6');
  expect(errors).toEqual([]);
});
test('BFS, DFS, playback controls, and directed unreachable paths work', async ({ page }) => {
  await loadGraph(page);
  await page.getByRole('button', { name: 'BFS', exact: true }).click();
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Route value')).toHaveText('3');
  await page.getByRole('button', { name: 'DFS', exact: true }).click();
  await page.getByRole('button', { name: 'Play algorithm' }).click();
  await expect.poll(async () => Number(await page.getByLabel('Algorithm step').inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause algorithm' }).click();
  await page.getByRole('button', { name: 'Dijkstra', exact: true }).click();
  await page.getByLabel('Start node').selectOption({ label: 'G' });
  await page.getByLabel('End node').selectOption({ label: 'A' });
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByText('No route from G to A')).toBeVisible();
  await expect(page.getByLabel('Route value')).toHaveText('∞');
});
test('real pointer strokes become a directed graph; a handwritten weight can be scrubbed and undone', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Pen (P)' })).toBeEnabled();
  for (const x of [400, 620]) await drawPath(page, Array.from({ length: 64 }, (_, i) => ({ x: x + Math.cos(i / 63 * Math.PI * 2) * 35, y: 350 + Math.sin(i / 63 * Math.PI * 2) * 35 })));
  await drawPath(page, [{ x: 440, y: 350 }, { x: 580, y: 350 }]);
  await drawPath(page, [{ x: 566, y: 342 }, { x: 580, y: 350 }, { x: 566, y: 358 }]);
  await expect(page.getByText('2 nodes · 1 connection')).toBeVisible();
  await drawPath(page, DIGIT_PATHS['4'][0].map(([x, y]) => ({ x: 503 + x * 1.2, y: 323 + y * 1.2 })));
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Route value')).toHaveText('4');
  await page.getByRole('button', { name: 'Select (V)' }).click();
  await page.mouse.move(510, 333); await page.mouse.down(); await page.mouse.move(510, 313, { steps: 10 }); await page.mouse.up();
  await expect(page.getByLabel('Route value')).toHaveText('5');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Route value')).toHaveText('4');
  expect(await page.locator('canvas').count()).toBe(1);
});
