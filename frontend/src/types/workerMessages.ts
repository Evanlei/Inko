import type { InkStroke } from './canvas';
import type { GraphASTNode, GraphSettings } from './graph';
import type { SemanticCluster } from './semantic';

export type InkWorkerRequest =
  | { type: 'compile'; revision: number; added: InkStroke[]; removedIds: string[]; settings: GraphSettings }
  | { type: 'traverse'; revision: number; settings: GraphSettings; override?: { edgeId: string; value: number } };
export type InkWorkerResponse =
  | { type: 'graph'; revision: number; graph: GraphASTNode | null; clusters: SemanticCluster[]; elapsedMs: number }
  | { type: 'error'; revision: number; message: string };
