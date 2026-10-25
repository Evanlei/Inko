import { describe, expect, it } from 'vitest';
import { Camera } from './Camera';
import { BoardStore } from './BoardStore';
import { strokeBounds } from '../types/canvas';
import type { InkStroke } from '../types/canvas';

function line(id: string, y = 0): InkStroke {
  const points = [{ x: -100, y, pressure: 0.5, t: 0 }, { x: 100, y, pressure: 0.5, t: 1 }];
  return { id, authorId: 'test', version: 1, createdAt: 0, points, bbox: strokeBounds(points, 4), size: 4, color: '#303c35', semanticRole: 'raw' };
}
describe('camera transforms', () => {
  it('keeps the world point under the cursor while zooming, including at limits', () => {
    const camera = new Camera(); camera.x = -500; camera.y = 300;
    const cursor = { x: 827, y: 119 }, world = camera.screenToWorld(cursor);
    for (const zoom of [2.7, 100, 0.001, 0.65]) {
      camera.zoomAt(cursor, zoom);
      const screen = camera.worldToScreen(world);
      expect(screen.x).toBeCloseTo(cursor.x); expect(screen.y).toBeCloseTo(cursor.y);
      expect(camera.zoom).toBeGreaterThanOrEqual(0.05); expect(camera.zoom).toBeLessThanOrEqual(5);
    }
  });
  it('fits drawing bounds into a desktop viewport', () => {
    const camera = new Camera(), box = { minX: -500, minY: -200, maxX: 1700, maxY: 1500 };
    camera.fit(box, 1440, 900);
    const a = camera.worldToScreen({ x: box.minX, y: box.minY });
    const b = camera.worldToScreen({ x: box.maxX, y: box.maxY });
    expect(a.x).toBeGreaterThan(0); expect(a.y).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(1440); expect(b.y).toBeLessThan(900);
  });
});
describe('editing history and spatial index', () => {
  it('replaces weight ink as one atomic edit and preserves both versions through undo/redo', () => {
    const board = new BoardStore(), old = line('weight-4'), next = line('weight-20', 20);
    board.add([old]); board.replace([old], [next]);
    expect([...board.strokes.keys()]).toEqual(['weight-20']);
    board.undo(); expect([...board.strokes.keys()]).toEqual(['weight-4']);
    board.redo(); expect([...board.strokes.keys()]).toEqual(['weight-20']);
  });
  it('replaces the spatial index and editing history when hydrating a document', () => {
    const board = new BoardStore(); board.add([line('old')]); board.hydrate([line('new', 200)]);
    expect(board.index.search({ minX: -200, minY: -200, maxX: 200, maxY: 400 })).toEqual(['new']);
    expect(board.getSnapshot()).toEqual({ strokeCount: 1, canUndo: false, canRedo: false });
  });
  it('treats a whole eraser gesture as one undoable edit', () => {
    const board = new BoardStore(); board.add([line('a'), line('b', 100)]);
    const removed = board.eraseBetween({ x: 0, y: -40 }, { x: 0, y: 140 }, 8);
    board.finishErase(removed);
    expect(board.strokes.size).toBe(0);
    board.undo(); expect(board.strokes.size).toBe(2);
    expect(board.index.search({ minX: -5, minY: -5, maxX: 5, maxY: 5 })).toEqual(['a']);
    board.redo(); expect(board.strokes.size).toBe(0);
  });
  it('detects intersections between sparse stroke points and restores canceled erasing', () => {
    const board = new BoardStore(); board.add([line('long')]);
    const removed = board.eraseBetween({ x: 0, y: -30 }, { x: 0, y: 30 }, 5);
    expect(removed.map((s) => s.id)).toEqual(['long']);
    board.cancelErase(removed); expect(board.strokes.size).toBe(1);
    board.undo(); expect(board.strokes.size).toBe(0);
  });
  it('clears in one operation and discards redo after a new edit', () => {
    const board = new BoardStore(); board.add([line('a')]); board.add([line('b', 100)]);
    board.clear(); board.undo(); expect(board.strokes.size).toBe(2);
    board.add([line('c', 200)]); expect(board.getSnapshot().canRedo).toBe(false);
  });
});
