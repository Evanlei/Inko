import type { InkStroke, Point } from '../types/canvas';
import { strokeBounds } from '../types/canvas';
import { numberInk } from './digits';

/** Actual pen coordinates. Circle and arrow recognition receives no topology hints. */
export function routingGraph(center: Point): InkStroke[] {
  const strokes: InkStroke[] = [];
  const positions = [{ x: 0, y: 180 }, { x: 180, y: 70 }, { x: 180, y: 290 },
    { x: 360, y: 40 }, { x: 360, y: 250 }, { x: 540, y: 150 }, { x: 720, y: 180 }];
  const origin = { x: center.x - 360, y: center.y - 165 };
  function add(points: Point[], size = 3): InkStroke {
    const ink = points.map((p, i) => ({ x: p.x + origin.x, y: p.y + origin.y, pressure: 0.5 + Math.sin(i * 0.47) * 0.06, t: i * 8 }));
    const stroke: InkStroke = { id: crypto.randomUUID(), authorId: 'local', version: 1, createdAt: Date.now() + strokes.length / 100,
      points: ink, bbox: strokeBounds(ink, size), color: '#4f5662', size, semanticRole: 'raw' };
    strokes.push(stroke); return stroke;
  }
  positions.forEach((p) => add(Array.from({ length: 96 }, (_, i) => {
    const angle = i / 95 * Math.PI * 2, radius = 34 + Math.sin(angle * 5) * 0.8;
    return { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius };
  }), 3.5));
  const connections = [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 5], [2, 4, 6], [3, 4, 2], [3, 5, 3], [4, 5, 1], [4, 6, 7], [5, 6, 2], [1, 4, 4]];
  for (const [from, to, weight] of connections) {
    const a = positions[from], b = positions[to], angle = Math.atan2(b.y - a.y, b.x - a.x);
    const start = { x: a.x + Math.cos(angle) * 41, y: a.y + Math.sin(angle) * 41 };
    const tip = { x: b.x - Math.cos(angle) * 43, y: b.y - Math.sin(angle) * 43 };
    const shaft = add(Array.from({ length: 48 }, (_, i) => {
      const t = i / 47, bend = Math.sin(t * Math.PI) * (from === 1 && to === 4 ? -18 : 3);
      return { x: start.x + (tip.x - start.x) * t - Math.sin(angle) * bend, y: start.y + (tip.y - start.y) * t + Math.cos(angle) * bend };
    }), 2.3);
    add([{ x: tip.x - 14 * Math.cos(angle - 0.45), y: tip.y - 14 * Math.sin(angle - 0.45) }, tip,
      { x: tip.x - 14 * Math.cos(angle + 0.45), y: tip.y - 14 * Math.sin(angle + 0.45) }], 2.3);
    const p = shaft.points[24];
    strokes.push(...numberInk(weight, { x: p.x + (from === 1 && to === 2 ? 18 : 0), y: p.y - (from === 1 && to === 2 ? 0 : 18) }, `edge:${shaft.id}`));
  }
  return strokes;
}
