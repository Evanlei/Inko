import type { Point, InkStroke } from '../types/canvas';
import { strokeBounds } from '../types/canvas';

/** Small, explicit handwriting vocabulary. These are templates, not an OCR model. */
export const DIGIT_PATHS: Record<string, number[][][]> = {
  '0': [Array.from({ length: 33 }, (_, i) => [5.5 + Math.sin(i / 32 * Math.PI * 2) * 5.5, 8 - Math.cos(i / 32 * Math.PI * 2) * 8])],
  '1': [[[2, 4], [6, 0], [6, 16]]],
  '2': [[[0, 3], [3, 0], [8, 0], [11, 3], [10, 6], [0, 16], [11, 16]]],
  '3': [[[0, 1], [8, 0], [11, 3], [9, 7], [5, 8], [10, 9], [11, 13], [8, 16], [0, 15]]],
  '4': [[[8, 16], [8, 0], [0, 10], [11, 10]]],
  '5': [[[11, 0], [0, 0], [0, 8], [7, 7], [11, 10], [10, 14], [7, 16], [0, 15]]],
  '6': [[[10, 0], [4, 1], [0, 7], [0, 13], [3, 16], [8, 16], [11, 13], [10, 9], [7, 7], [0, 9]]],
  '7': [[[0, 0], [11, 0], [3, 16]]],
  '8': [[[5, 8], [0, 5], [1, 1], [6, 0], [10, 3], [9, 6], [5, 8], [0, 11], [1, 15], [7, 16], [11, 13], [10, 10], [5, 8]]],
  '9': [[[11, 7], [4, 8], [0, 5], [1, 1], [7, 0], [11, 3], [11, 10], [7, 16], [1, 16]]],
};

export function numberInk(value: number, center: Point, edgeId?: string): InkStroke[] {
  if (!Number.isFinite(value) || value < 0 || value > 1e6) throw new RangeError('Weights must be between 0 and 1,000,000.');
  const text = String(Number(value.toFixed(3))), scale = 1.25, advance = 19;
  return [...text].flatMap((digit, index) => {
    const paths = digit === '.' ? [[[5, 16], [5.1, 16.1]]] : DIGIT_PATHS[digit];
    return paths.map((path) => {
      const points = path.map(([x, y], i) => ({ x: center.x - text.length * advance / 2 + index * advance + x * scale,
        y: center.y - 10 + y * scale, pressure: 0.5, t: i * 8 }));
      return { id: crypto.randomUUID(), authorId: 'local', version: 1, createdAt: Date.now() + index / 100,
        points, bbox: strokeBounds(points, 2.5), color: '#505761', size: 2.5,
        semanticRole: 'graph_weight' as const, recognizedToken: digit, graphEdgeId: edgeId };
    });
  });
}
