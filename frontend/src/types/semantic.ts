import type { BBox } from './canvas';

export interface SemanticCluster {
  id: string;
  bbox: BBox;
  strokeIds: string[];
  category: 'graph_topology' | 'freeform_notes' | 'math_workspace';
  title: string;
  primaryMetric: string;
  secondaryBadge: string;
  preview: { vertices: [number, number][]; edges: [number, number][] } | null;
  sparkline?: [number, number | null][];
}

export function inkOpacity(zoom: number) {
  const t = Math.max(0, Math.min(1, (zoom - 0.18) / 0.2));
  return t * t * (3 - 2 * t);
}
