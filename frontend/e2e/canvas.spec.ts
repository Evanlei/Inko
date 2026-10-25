import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function draw(page: Page, offset = 0) {
  await page.mouse.move(450, 330 + offset);
  await page.mouse.down();
  await page.mouse.move(650, 400 + offset, { steps: 30 });
  await page.mouse.up();
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas.board').evaluate((canvas: HTMLCanvasElement, point) => {
    const dpr = window.devicePixelRatio;
    return [...canvas.getContext('2d')!.getImageData(Math.round(point.x * dpr), Math.round(point.y * dpr), 1, 1).data];
  }, { x, y });
}
test('drawing is visible, undoable, and durable across refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await expect(page.getByText('Saved on this device')).toBeVisible();
  await draw(page); await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
  await expect.poll(async () => (await pixel(page, 550, 365))[0]).toBeLessThan(100);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Room for anything')).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('My first Inko board');
  await page.getByRole('textbox', { name: 'Workspace name' }).blur();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('My first Inko board');
  await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
  await expect.poll(async () => (await pixel(page, 550, 365))[0]).toBeLessThan(100);
  expect(errors).toEqual([]);
});
test('pan, zoom, erase, and recover a drawing', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('Saved on this device')).toBeVisible();
  await draw(page);
  await page.keyboard.down('Space'); await page.mouse.move(800, 500); await page.mouse.down();
  await page.mouse.move(900, 550, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Space');
  await expect.poll(async () => (await pixel(page, 650, 415))[0]).toBeLessThan(100);
  await page.mouse.move(650, 415); await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: /Zoom \d+ percent/ })).not.toHaveText('100%');
  await expect.poll(async () => (await pixel(page, 650, 415))[0]).toBeLessThan(100);
  await page.getByRole('button', { name: 'Eraser (E)' }).click();
  await page.mouse.move(650, 415); await page.mouse.down(); await page.mouse.up();
  await expect(page.getByText('Room for anything')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
});
test('sample drawing exports an image and clear can be undone', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Examples', exact: true }).click(); await page.getByRole('button', { name: 'Try a sketch' }).click();
  await expect(page.getByText('13 strokes', { exact: true })).toBeVisible();
  await expect(page.getByText(/13 visible/)).toBeAttached();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toBe('Untitled space.png');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Room for anything')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('13 strokes', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.screenshot({ path: 'test-results/inko-desktop.png' });
});
test('controls fit on a phone and shortcuts dialog is keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pen (P)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/inko-mobile.png' });
});

test('FastAPI receives browser WebSocket updates through the Vite proxy and replays them', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const room = `test-${crypto.randomUUID()}`;
    const endpoint = `${location.origin.replace(/^http/, 'ws')}/ws/${room}`;
    function connect() {
      return new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(endpoint); socket.binaryType = 'arraybuffer';
        socket.onopen = () => resolve(socket); socket.onerror = reject;
      });
    }
    function message(socket: WebSocket) {
      return new Promise<number[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket relay timed out')), 5000);
        socket.onmessage = (event) => { clearTimeout(timer); resolve([...new Uint8Array(event.data)]); };
      });
    }
    const health = await fetch('/api/health').then((r) => r.json());
    const alice = await connect(), bob = await connect();
    const delivery = message(bob); alice.send(new Uint8Array([1, 0, 0]));
    const relayed = await delivery;
    const late = new WebSocket(endpoint); late.binaryType = 'arraybuffer';
    const replayed = await message(late);
    const stats = await fetch(`/api/rooms/${room}/stats`).then((r) => r.json());
    alice.close(); bob.close(); late.close();
    return { health, relayed, replayed, stats };
  });
  expect(result.health.status).toBe('ok'); expect(result.relayed).toEqual([1, 0, 0]);
  expect(result.replayed).toEqual([1, 0, 0]); expect(result.stats.stored_yjs_updates).toBe(1);
  expect(result.stats.active_peers).toBe(3);
});

test.describe('touch gestures', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('one finger draws; two fingers pan and zoom without leaving stray strokes', async ({ page, context }) => {
    await page.goto('/'); await expect(page.getByRole('button', { name: 'Pen (P)' })).toBeEnabled();
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await touch('touchStart', [{ x: 130, y: 300, id: 1 }]);
    await touch('touchMove', [{ x: 260, y: 360, id: 1 }]);
    await touch('touchEnd', []);
    await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
    await touch('touchStart', [{ x: 180, y: 450, id: 1 }]);
    await touch('touchStart', [{ x: 180, y: 450, id: 1 }, { x: 220, y: 450, id: 2 }]);
    await touch('touchMove', [{ x: 130, y: 440, id: 1 }, { x: 290, y: 440, id: 2 }]);
    await expect(page.getByRole('button', { name: /Zoom 400 percent/ })).toBeVisible();
    await touch('touchEnd', [{ x: 130, y: 440, id: 1 }]);
    await touch('touchMove', [{ x: 140, y: 450, id: 1 }]);
    await touch('touchEnd', []);
    await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
    await cdp.detach();
  });
});

test('drawing and export still work when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, 'open', { value: () => { throw new DOMException('Storage disabled', 'SecurityError'); } });
  });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Local saving unavailable');
  await draw(page); await expect(page.getByText('1 stroke', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test('a 50,000-point workspace loads with viewport culling and sleeps while idle', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __inkoFrames: number };
    state.__inkoFrames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => { state.__inkoFrames++; return raf(callback); };
  });
  await page.goto('/'); await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('inko-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction(['strokes', 'meta'], 'readwrite'), store = tx.objectStore('strokes');
      store.clear();
      for (let n = 0; n < 500; n++) {
        const x = 200 + n % 25 * 240, y = 180 + Math.floor(n / 25) * 160;
        const points = Array.from({ length: 100 }, (_, i) => ({ x: x + i, y: y + Math.sin(i / 10) * 20, pressure: 0.5, t: i }));
        store.put({ id: `benchmark-${n}`, authorId: 'test', createdAt: n, version: 1, color: '#303c35', size: 3, semanticRole: 'raw', points,
          bbox: { minX: x - 3, minY: y - 23, maxX: x + 103, maxY: y + 23 } });
      }
      tx.objectStore('meta').put({ title: '50k point benchmark', camera: { x: 0, y: 0, zoom: 1 } }, 'workspace');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload(); await expect(page.getByText('500 strokes', { exact: true })).toBeVisible();
  await expect.poll(async () => Number((await page.locator('.footer-detail').textContent())?.match(/(\d+) visible/)?.[1])).toBeGreaterThan(0);
  const telemetry = await page.locator('.footer-detail').textContent();
  expect(Number(telemetry?.match(/(\d+) visible/)?.[1])).toBeLessThan(500);
  const frameCount = () => page.evaluate(() => (window as typeof window & { __inkoFrames: number }).__inkoFrames);
  await page.waitForTimeout(250);
  const before = await frameCount(); await page.waitForTimeout(250); expect(await frameCount()).toBe(before);
  await testInfo.attach('50k-point-workspace', { body: JSON.stringify({ strokes: 500, points: 50000, telemetry, idleFrameRequests: 0 }), contentType: 'application/json' });
});
