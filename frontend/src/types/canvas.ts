export interface BBox { minX: number; minY: number; maxX: number; maxY: number }
export interface Point { x: number; y: number }
export interface StrokePoint extends Point { pressure: number; t: number }
export interface InkStroke {
  id: string;
  authorId: string;
  version: number;
  createdAt: number;
  points: StrokePoint[];
  bbox: BBox;
  color: string;
  size: number;
  semanticRole: 'raw' | 'math_symbol' | 'graph_vertex' | 'graph_edge' | 'graph_weight' | 'plot_axis';
  recognizedToken?: string;
  graphEdgeId?: string;
  mathLineId?: string;
  mathTokenIndex?: number;
  mathOrigin?: Point;
}
export type Tool = 'pen' | 'eraser' | 'hand' | 'select';
export interface CameraState { x: number; y: number; zoom: number }
export interface BoardMeta { title: string; camera: CameraState }
export interface BoardChange { added: InkStroke[]; removed: InkStroke[] }
export interface BoardSnapshot { strokeCount: number; canUndo: boolean; canRedo: boolean }
export const COLORS = ['#444b55', '#bb785c', '#75a1ad', '#8d91b3', '#9b9a8a'] as const;

export function strokeBounds(points: StrokePoint[], size: number): BBox {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    box.minX = Math.min(box.minX, point.x - size);
    box.minY = Math.min(box.minY, point.y - size);
    box.maxX = Math.max(box.maxX, point.x + size);
    box.maxY = Math.max(box.maxY, point.y + size);
  }
  return box;
}
