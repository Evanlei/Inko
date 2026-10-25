import { getStroke } from 'perfect-freehand';
import type { InkStroke } from '../types/canvas';

function makePath(stroke: InkStroke, complete: boolean): Path2D {
  const polygon = getStroke(stroke.points.map((p) => [p.x, p.y, p.pressure]), {
    size: stroke.size, thinning: 0.45, smoothing: 0.6, streamline: 0.45,
    simulatePressure: false, last: complete,
  });
  const path = new Path2D();
  if (!polygon.length) return path;
  path.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}
export class PathCache {
  private paths = new Map<string, { version: number; path: Path2D }>();
  private active?: { id: string; length: number; path: Path2D };
  get(stroke: InkStroke) {
    const cached = this.paths.get(stroke.id);
    if (cached?.version === stroke.version) return cached.path;
    const path = makePath(stroke, true);
    this.paths.set(stroke.id, { version: stroke.version, path });
    return path;
  }
  preview(stroke: InkStroke) {
    if (this.active?.id === stroke.id && this.active.length === stroke.points.length) return this.active.path;
    const path = makePath(stroke, false);
    this.active = { id: stroke.id, length: stroke.points.length, path };
    return path;
  }
  remove(id: string) { this.paths.delete(id); }
}
