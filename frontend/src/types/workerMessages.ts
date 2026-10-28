import type { InkStroke } from './canvas';
import type { GraphASTNode, GraphSettings } from './graph';
import type { SemanticCluster } from './semantic';
import type { MathASTNode, MathOverride } from './math';

export type InkWorkerRequest =
  | { type: 'compile'; revision: number; added: InkStroke[]; removedIds: string[]; settings: GraphSettings }
  | { type: 'traverse'; revision: number; settings: GraphSettings; override?: { edgeId: string; value: number } }
  | { type: 'evaluate'; revision: number; settings: GraphSettings; override?: MathOverride };
export type InkWorkerResponse =
  | { type: 'graph'; revision: number; graph: GraphASTNode | null; math: MathASTNode[]; clusters: SemanticCluster[]; elapsedMs: number }
  | { type: 'error'; revision: number; message: string };
