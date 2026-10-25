import { SpatialIndex } from './SpatialIndex';
import type { BBox, BoardChange, BoardSnapshot, InkStroke, Point } from '../types/canvas';

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export class BoardStore {
  readonly strokes = new Map<string, InkStroke>();
  readonly index = new SpatialIndex();
  private undoStack: BoardChange[] = [];
  private redoStack: BoardChange[] = [];
  private listeners = new Set<(change: BoardChange) => void>();
  private snapshot: BoardSnapshot = { strokeCount: 0, canUndo: false, canRedo: false };

  subscribe = (listener: (change: BoardChange) => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;
  private insert(stroke: InkStroke) { this.strokes.set(stroke.id, stroke); this.index.insert(stroke); }
  private remove(stroke: InkStroke) { this.strokes.delete(stroke.id); this.index.remove(stroke.id); }
  private notify(change: BoardChange) {
    this.snapshot = { strokeCount: this.strokes.size, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
    this.listeners.forEach((listener) => listener(change));
  }
  hydrate(strokes: InkStroke[]) {
    this.strokes.clear();
    this.index.clear(); this.undoStack = []; this.redoStack = [];
    for (const stroke of strokes) this.insert(stroke);
    this.notify({ added: [], removed: [] });
  }
  private record(change: BoardChange) {
    if (!change.added.length && !change.removed.length) return;
    this.undoStack.push(change);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.notify(change);
  }
  add(strokes: InkStroke[]) {
    strokes.forEach((stroke) => this.insert(stroke));
    this.record({ added: strokes, removed: [] });
  }
  replace(removed: InkStroke[], added: InkStroke[]) {
    removed.forEach((stroke) => this.remove(stroke));
    added.forEach((stroke) => this.insert(stroke));
    this.record({ added, removed });
  }
  eraseBetween(a: Point, b: Point, radius: number): InkStroke[] {
    const box = { minX: Math.min(a.x, b.x) - radius, minY: Math.min(a.y, b.y) - radius, maxX: Math.max(a.x, b.x) + radius, maxY: Math.max(a.y, b.y) + radius };
    const removed: InkStroke[] = [];
    // Sample the eraser sweep, not just its latest point, to avoid gaps at high speed.
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, radius / 2)));
    for (const id of this.index.search(box)) {
      const stroke = this.strokes.get(id)!;
      let hit = false;
      for (let sample = 0; sample <= steps && !hit; sample++) {
        const p = { x: a.x + (b.x - a.x) * sample / steps, y: a.y + (b.y - a.y) * sample / steps };
        for (let i = 0; i < stroke.points.length; i++) {
          if (segmentDistance(p, stroke.points[Math.max(0, i - 1)], stroke.points[i]) <= radius + stroke.size / 2) { hit = true; break; }
        }
      }
      if (hit) { this.remove(stroke); removed.push(stroke); }
    }
    return removed;
  }
  finishErase(removed: InkStroke[]) { this.record({ added: [], removed }); }
  cancelErase(removed: InkStroke[]) { removed.forEach((stroke) => this.insert(stroke)); }
  clear() {
    const removed = [...this.strokes.values()];
    removed.forEach((stroke) => this.remove(stroke));
    this.record({ added: [], removed });
  }
  undo() {
    const change = this.undoStack.pop();
    if (!change) return;
    change.added.forEach((stroke) => this.remove(stroke));
    change.removed.forEach((stroke) => this.insert(stroke));
    this.redoStack.push(change);
    this.notify({ added: change.removed, removed: change.added });
  }
  redo() {
    const change = this.redoStack.pop();
    if (!change) return;
    change.removed.forEach((stroke) => this.remove(stroke));
    change.added.forEach((stroke) => this.insert(stroke));
    this.undoStack.push(change);
    this.notify(change);
  }
  bounds(): BBox | null {
    if (!this.strokes.size) return null;
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const stroke of this.strokes.values()) {
      box.minX = Math.min(box.minX, stroke.bbox.minX); box.minY = Math.min(box.minY, stroke.bbox.minY);
      box.maxX = Math.max(box.maxX, stroke.bbox.maxX); box.maxY = Math.max(box.maxY, stroke.bbox.maxY);
    }
    return box;
  }
}
