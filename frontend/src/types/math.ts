import type { BBox } from './canvas';

export interface MathASTNode {
  kind: 'math';
  id: string;
  strokeIds: string[];
  bbox: BBox;
  displayBBox: BBox;
  rawExpression: string;
  dependencies: string[];
  variableName?: string;
  numericValue?: number;
  scrubTarget?: { value: number; valueBBox: BBox };
  plot?: { bbox: BBox; domain: [number, number]; range: [number, number]; samples: [number, number | null][] };
  error?: string;
}
export interface MathOverride { nodeId: string; value: number }
export function formatMath(value: number) { return Number(value.toPrecision(6)).toString(); }
