import type { InkStroke } from '../types/canvas';
import type { GraphASTNode } from '../types/graph';
import type { InkWorkerRequest, InkWorkerResponse } from '../types/workerMessages';
import { classifyStroke } from './heuristics';
import type { Geometry } from './heuristics';
import { compileGraph, recomputeGraph } from './GraphEngine';
import { InkClustering } from './dbscan';
import type { InkCluster } from './dbscan';
import { summarize } from './semantic';

const strokes = new Map<string, InkStroke>(), geometry = new Map<string, Geometry>();
let graph: GraphASTNode | null = null;
const clustering = new InkClustering();
let clusters: InkCluster[] = [];
self.onmessage = (event: MessageEvent<InkWorkerRequest>) => {
  const message = event.data, started = performance.now();
  try {
    if (message.type === 'compile') {
      message.removedIds.forEach((id) => { strokes.delete(id); geometry.delete(id); });
      for (const stroke of message.added) {
        const old = strokes.get(stroke.id);
        strokes.set(stroke.id, stroke);
        if (!old || old.version !== stroke.version) geometry.set(stroke.id, classifyStroke(stroke));
      }
      graph = compileGraph([...strokes.values()], message.settings, geometry);
      clusters = clustering.update(message.added, message.removedIds);
    }
    const result = message.type === 'traverse' && graph ? recomputeGraph(graph, message.settings, message.override) : graph;
    const response: InkWorkerResponse = { type: 'graph', revision: message.revision, graph: result, clusters: summarize(clusters, result), elapsedMs: performance.now() - started };
    self.postMessage(response);
  } catch (error) {
    const response: InkWorkerResponse = { type: 'error', revision: message.revision, message: error instanceof Error ? error.message : 'Could not analyze this graph.' };
    self.postMessage(response);
  }
};
