import type { BBox, InkStroke, Point } from '../types/canvas';

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function bounds(points: Point[]): BBox {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    box.minX = Math.min(box.minX, p.x); box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x); box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
}
export function union(boxes: BBox[]): BBox {
  return bounds(boxes.flatMap((b) => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY }]));
}
export function resample(points: Point[], count = 64): Point[] {
  if (!points.length) return [];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths.at(-1)!;
  if (!total) return Array.from({ length: count }, () => ({ ...points[0] }));
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = total * i / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < target) segment++;
    const a = points[segment - 1], b = points[segment], span = lengths[segment] - lengths[segment - 1];
    const t = span ? (target - lengths[segment - 1]) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}
export interface Geometry {
  points: Point[]; length: number; box: BBox;
  circle?: { center: Point; radius: number };
  arrow?: { tip: Point; shaft: Point[] };
  chevron?: { tip: Point; direction: Point };
}
export function classifyStroke(stroke: InkStroke): Geometry {
  const points = resample(stroke.points), box = bounds(stroke.points);
  let length = 0;
  for (let i = 1; i < stroke.points.length; i++) length += distance(stroke.points[i - 1], stroke.points[i]);
  const result: Geometry = { points, length, box };
  if (points.length < 2 || length < 8 || stroke.semanticRole === 'graph_weight') return result;
  const width = box.maxX - box.minX, height = box.maxY - box.minY;
  const center = points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }), { x: 0, y: 0 });
  const radii = points.map((p) => distance(p, center)), radius = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = Math.sqrt(radii.reduce((sum, r) => sum + (r - radius) ** 2, 0) / radii.length);
  if (distance(points[0], points.at(-1)!) / length < 0.24 && Math.min(width, height) / Math.max(width, height) > 0.55
    && variance / radius < 0.28 && radius >= 16 && radius <= 140) {
    result.circle = { center, radius }; return result;
  }
  let furthest = 25, tipIndex = -1;
  for (let i = 36; i < 60; i++) {
    const a = points[i - 3], tip = points[i], b = points[i + 3];
    const cosine = ((tip.x - a.x) * (b.x - tip.x) + (tip.y - a.y) * (b.y - tip.y)) / (distance(a, tip) * distance(tip, b) || 1);
    const displacement = distance(points[0], tip);
    if (cosine < -0.42 && displacement > furthest) { furthest = displacement; tipIndex = i; }
  }
  if (tipIndex >= 0) result.arrow = { tip: points[tipIndex], shaft: points.slice(0, tipIndex + 1) };
  if (length < 110 && Math.max(width, height) < 60 && distance(points[0], points.at(-1)!) / length < 0.9) {
    let furthestFromBase = 0, corner = -1;
    for (let i = 19; i <= 44; i++) {
      const a = points[0], tip = points[i], b = points.at(-1)!;
      const cosine = ((a.x - tip.x) * (b.x - tip.x) + (a.y - tip.y) * (b.y - tip.y)) / (distance(a, tip) * distance(b, tip) || 1);
      const height = Math.abs((b.x - a.x) * (tip.y - a.y) - (b.y - a.y) * (tip.x - a.x)) / (distance(a, b) || 1);
      if (cosine > 0.1 && cosine < 0.95 && height > furthestFromBase) { furthestFromBase = height; corner = i; }
    }
    if (corner >= 0) {
      const tip = points[corner], middle = { x: (points[0].x + points.at(-1)!.x) / 2, y: (points[0].y + points.at(-1)!.y) / 2 };
      const d = distance(tip, middle) || 1;
      result.chevron = { tip, direction: { x: (tip.x - middle.x) / d, y: (tip.y - middle.y) / d } };
    }
  }
  return result;
}
