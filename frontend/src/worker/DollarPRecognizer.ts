/** Independent implementation of the $P algorithm (Vatavu, Anthony & Wobbrock, 2012).
 * Reference: https://depts.washington.edu/acelab/proj/dollar/pdollar.html
 * Character segmentation and confidence rejection are application-specific.
 */
import type { Point } from '../types/canvas';
import { DIGIT_PATHS } from '../presets/digits';
import { bounds, distance } from './heuristics';

interface CloudPoint extends Point { stroke: number }
const COUNT = 32;
export function normalize(paths: Point[][]): Point[] {
  const segments: { a: CloudPoint; b: CloudPoint; start: number; end: number }[] = [];
  let total = 0;
  paths.forEach((path, stroke) => {
    for (let i = 1; i < path.length; i++) {
      const a = { ...path[i - 1], stroke }, b = { ...path[i], stroke }, length = distance(a, b);
      if (length) { segments.push({ a, b, start: total, end: total + length }); total += length; }
    }
  });
  if (!segments.length) return [];
  let index = 0;
  const points = Array.from({ length: COUNT }, (_, i) => {
    const target = total * i / (COUNT - 1);
    while (index < segments.length - 1 && segments[index].end < target) index++;
    const s = segments[index], t = (target - s.start) / (s.end - s.start);
    return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
  });
  const box = bounds(points), scale = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1e-9);
  const center = points.reduce((p, v) => ({ x: p.x + v.x / COUNT, y: p.y + v.y / COUNT }), { x: 0, y: 0 });
  return points.map((p) => ({ x: (p.x - center.x) / scale, y: (p.y - center.y) / scale }));
}
function cloudDistance(a: Point[], b: Point[], start: number) {
  const matched = new Set<number>();
  let sum = 0;
  for (let offset = 0; offset < COUNT; offset++) {
    const point = a[(start + offset) % COUNT];
    let closest = -1, minimum = Infinity;
    for (let j = 0; j < COUNT; j++) {
      if (matched.has(j)) continue;
      const d = distance(point, b[j]);
      if (d < minimum) { minimum = d; closest = j; }
    }
    matched.add(closest); sum += (1 - offset / COUNT) * minimum;
  }
  return sum / ((COUNT + 1) / 2);
}
function match(a: Point[], b: Point[]) {
  let minimum = Infinity;
  for (let i = 0; i < COUNT; i += Math.floor(Math.sqrt(COUNT))) minimum = Math.min(minimum, cloudDistance(a, b, i), cloudDistance(b, a, i));
  return minimum;
}
export class DollarPRecognizer {
  private templates = Object.entries(DIGIT_PATHS).flatMap(([token, paths]) => [
    { token, cloud: normalize(paths.map((path) => path.map(([x, y]) => ({ x, y })))) },
    // A common handwritten 1 has no leading hook.
    ...(token === '1' ? [{ token, cloud: normalize([[{ x: 0, y: 0 }, { x: 0, y: 16 }]]) }] : []),
  ]);
  recognize(paths: Point[][]): { token: string; confidence: number } | null {
    const cloud = normalize(paths);
    if (cloud.length !== COUNT) return null;
    const scores = new Map<string, number>();
    for (const template of this.templates) scores.set(template.token, Math.min(scores.get(template.token) ?? Infinity, match(cloud, template.cloud)));
    const ranked = [...scores.entries()].sort((a, b) => a[1] - b[1]);
    const [token, d] = ranked[0], margin = ranked[1][1] - d;
    if (d > 0.11 || margin < 0.008) return null;
    return { token, confidence: Math.max(0, 1 - d * 4) };
  }
}
