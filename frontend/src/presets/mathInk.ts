import type { InkStroke, Point } from '../types/canvas';
import { strokeBounds } from '../types/canvas';
import { DIGIT_PATHS } from './digits';

/** A small line alphabet for seeded/typed ink; these paths also supply recognizer templates. */
export const MATH_PATHS: Record<string, number[][][]> = {
  ...DIGIT_PATHS,
  '.': [[[5, 16], [5.2, 16.2]]], ',': [[[5, 15], [3, 20]]],
  '+': [[[0, 8], [11, 8]], [[5.5, 2], [5.5, 14]]], '-': [[[0, 8], [11, 8]]],
  '=': [[[0, 5], [11, 5]], [[0, 11], [11, 11]]], '*': [[[1, 3], [10, 13]], [[1, 13], [10, 3]]],
  '/': [[[0, 17], [11, -1]]], '^': [[[0, 6], [5, 0], [11, 6]]], '_': [[[0, 18], [11, 18]]],
  '(': [[[8, -2], [3, 2], [1, 8], [3, 14], [8, 18]]], ')': [[[3, -2], [8, 2], [10, 8], [8, 14], [3, 18]]],
  a: [[[10, 7], [7, 4], [2, 5], [0, 10], [2, 15], [7, 15], [10, 10], [10, 4], [10, 16]]],
  b: [[[1, -2], [1, 16], [1, 9], [4, 4], [9, 5], [11, 10], [9, 15], [3, 16], [1, 13]]],
  c: [[[11, 5], [6, 3], [1, 6], [0, 12], [4, 16], [10, 15]]],
  d: [[[10, -2], [10, 16], [10, 8], [7, 4], [2, 5], [0, 11], [3, 16], [8, 15], [10, 11]]],
  e: [[[0, 10], [10, 9], [9, 5], [5, 4], [1, 7], [0, 12], [4, 16], [10, 15]]],
  f: [[[3, 18], [4, 2], [7, -2], [11, -1]], [[0, 6], [10, 6]]],
  g: [[[10, 5], [5, 3], [1, 6], [0, 11], [4, 15], [9, 13], [10, 5], [10, 19], [6, 23], [1, 21]]],
  h: [[[1, -2], [1, 16], [1, 9], [5, 4], [9, 5], [10, 16]]],
  i: [[[5, 5], [5, 16]], [[5, -1], [5.1, -0.9]]],
  j: [[[8, 5], [8, 19], [4, 23], [0, 20]], [[8, -1], [8.1, -0.9]]],
  k: [[[1, -2], [1, 16]], [[10, 4], [1, 10], [11, 16]]],
  l: [[[4, -2], [4, 14], [7, 16]]],
  m: [[[0, 16], [0, 4], [0, 8], [3, 4], [5, 6], [5, 16], [5, 8], [8, 4], [11, 6], [11, 16]]],
  n: [[[0, 16], [0, 4], [0, 9], [5, 4], [10, 6], [10, 16]]],
  o: [[[5, 4], [1, 6], [0, 12], [3, 16], [8, 15], [11, 10], [9, 5], [5, 4]]],
  p: [[[1, 23], [1, 4], [1, 9], [5, 4], [10, 6], [11, 11], [8, 15], [2, 14]]],
  q: [[[10, 5], [5, 3], [1, 7], [0, 12], [4, 16], [9, 13], [10, 5], [10, 23]]],
  r: [[[1, 16], [1, 4], [1, 9], [5, 4], [10, 5]]],
  s: [[[10, 5], [5, 3], [0, 6], [2, 9], [8, 11], [10, 14], [6, 16], [0, 14]]],
  t: [[[5, -1], [5, 13], [8, 16], [11, 14]], [[0, 5], [11, 5]]],
  u: [[[0, 4], [0, 12], [3, 16], [7, 15], [10, 10], [10, 4], [10, 16]]],
  v: [[[0, 4], [5, 16], [11, 4]]], w: [[[0, 4], [2, 16], [5, 9], [8, 16], [11, 4]]],
  x: [[[0, 4], [11, 16]], [[0, 16], [11, 4]]], y: [[[0, 4], [5, 14], [10, 4], [5, 18], [1, 23]]],
  z: [[[0, 4], [11, 4], [0, 16], [11, 16]]],
};

export function expressionInk(text: string, origin: Point, lineId: string = crypto.randomUUID()): InkStroke[] {
  if (!text.trim() || text.length > 160 || [...text].some((c) => c !== ' ' && !MATH_PATHS[c])) throw new Error('Use lowercase letters, numbers, and arithmetic symbols (up to 160 characters).');
  return [...text].flatMap((token, index) => (MATH_PATHS[token] ?? []).map((path) => {
    const points = path.map(([x, y], i) => ({ x: origin.x + index * 17 + x * 1.2, y: origin.y + y * 1.2, t: i * 8, pressure: 0.5 }));
    return { id: crypto.randomUUID(), authorId: 'local', version: 1, createdAt: Date.now() + index / 100,
      points, bbox: strokeBounds(points, 2), color: '#505761', size: 2, semanticRole: 'math_symbol' as const,
      recognizedToken: token, mathLineId: lineId, mathTokenIndex: index, mathOrigin: origin };
  }));
}

export function oscillatorLab(center: Point): InkStroke[] {
  return ['k = 4.0', 'c = 0.35', 'w = sqrt(k)', 'y(x) = exp(-c*x) * cos(k*x)'].flatMap((text, i) => expressionInk(text, { x: center.x - 290, y: center.y - 220 + i * 58 }));
}
