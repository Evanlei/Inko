import type { BBox, Point } from './canvas';
import type { SemanticCluster } from './semantic';

export type Algorithm = 'dijkstra' | 'bfs' | 'dfs';
export interface GraphVertex {
  id: string; label: string; strokeId: string; center: Point; radius: number; bbox: BBox;
}
export interface GraphEdge {
  id: string; strokeId: string; headStrokeId?: string;
  sourceVertexId: string; targetVertexId: string; directed: boolean;
  weight: number; weightStrokeIds: string[]; weightBBox: BBox;
  controlPoints: Point[]; midpoint: Point;
}
export interface AlgorithmStep {
  stepIndex: number;
  phase: 'ready' | 'visit' | 'relax' | 'complete';
  visitedVertexIds: string[]; frontierVertexIds: string[];
  activeEdgeId?: string;
  pathVertexIds: string[]; pathEdgeIds: string[];
  distances: Record<string, number | 'INF'>;
  description: string;
}
export interface GraphASTNode {
  kind: 'graph'; id: string; bbox: BBox; strokeIds: string[];
  vertices: GraphVertex[]; edges: GraphEdge[];
  startVertexId: string; targetVertexId: string;
  steps: Record<Algorithm, AlgorithmStep[]>;
}
export interface GraphSettings { startVertexId?: string; targetVertexId?: string }
export interface GraphSnapshot {
  clusters: SemanticCluster[];
  graph: GraphASTNode | null; processing: boolean; error: string | null;
  algorithm: Algorithm; stepIndex: number; playing: boolean;
  selectedEdgeId: string | null; workerMs: number;
}
export const EMPTY_GRAPH: GraphSnapshot = {
  clusters: [],
  graph: null, processing: false, error: null, algorithm: 'dijkstra', stepIndex: 0,
  playing: false, selectedEdgeId: null, workerMs: 0,
};
