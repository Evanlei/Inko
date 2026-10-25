import { strokeBounds } from '../types/canvas';
import type { InkStroke, Point } from '../types/canvas';

export function sampleSketch(center: Point): InkStroke[] {
  const strokes: InkStroke[] = [];
  function add(points: Point[], color = '#303c35', size = 4) {
    const ink = points.map((p, i) => ({ x: center.x + p.x, y: center.y + p.y, pressure: 0.5 + Math.sin(i * 0.7) * 0.08, t: i * 8 }));
    strokes.push({ id: crypto.randomUUID(), authorId: 'local', version: 1, createdAt: Date.now() + strokes.length / 100, points: ink, bbox: strokeBounds(ink, size), color, size, semanticRole: 'raw' });
  }
  function ring(cx: number, cy: number, r: number, color: string) {
    add(Array.from({ length: 110 }, (_, i) => {
      const a = i / 109 * Math.PI * 2, radius = r + Math.sin(a * 5) * 1.5;
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    }), color);
  }
  ring(-210, 0, 48, '#798c40'); ring(0, -100, 39, '#8174b6'); ring(210, 0, 48, '#e69c4c'); ring(0, 120, 39, '#303c35');
  for (const [ax, ay, bx, by] of [[-155, -15, -48, -86], [48, -86, 155, -15], [-155, 20, -48, 109], [48, 109, 155, 20]]) {
    add(Array.from({ length: 35 }, (_, i) => ({ x: ax + (bx - ax) * i / 34, y: ay + (by - ay) * i / 34 + Math.sin(i / 34 * Math.PI) * 10 })), '#87917e', 3);
    const angle = Math.atan2(by - ay, bx - ax);
    add([{ x: bx - 15 * Math.cos(angle - 0.45), y: by - 15 * Math.sin(angle - 0.45) }, { x: bx, y: by }, { x: bx - 15 * Math.cos(angle + 0.45), y: by - 15 * Math.sin(angle + 0.45) }], '#87917e', 3);
  }
  add(Array.from({ length: 160 }, (_, i) => ({ x: -130 + i * 1.65, y: 18 - Math.sin(i / 159 * Math.PI * 4) * 24 })), '#c76c76', 3);
  return strokes;
}
