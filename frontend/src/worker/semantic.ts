import type { GraphASTNode } from '../types/graph';
import type { SemanticCluster } from '../types/semantic';
import type { InkCluster } from './dbscan';
import { recomputeGraph } from './GraphEngine';
import type { MathASTNode } from '../types/math';
import { formatMath } from '../types/math';
import { union } from './heuristics';

export function summarize(clusters: InkCluster[], graph: GraphASTNode | null, math: MathASTNode[] = []): SemanticCluster[] {
  return clusters.map((cluster) => {
    const members = new Set(cluster.strokeIds);
    const vertices = graph?.vertices.filter((v) => members.has(v.strokeId)) ?? [];
    const vertexIds = new Set(vertices.map((v) => v.id));
    const edges = graph?.edges.filter((e) => members.has(e.strokeId) && vertexIds.has(e.sourceVertexId) && vertexIds.has(e.targetVertexId)) ?? [];
    const equations = math.filter((m) => m.strokeIds.some((id) => members.has(id)));
    if (!edges.length && equations.length) {
      const plot = [...equations].reverse().find((n) => n.plot)?.plot, last = equations.at(-1)!;
      const errors = equations.filter((n) => n.error).length;
      return { ...cluster, bbox: union([cluster.bbox, ...equations.map((n) => n.displayBBox)]), category: 'math_workspace', title: 'Live math',
        primaryMetric: errors ? `${errors} equation error${errors === 1 ? '' : 's'}` : last.plot ? `${last.variableName}(x) · 200 samples`
          : `${last.variableName ?? 'Result'} = ${formatMath(last.numericValue!)}`,
        secondaryBadge: `${equations.length} equations · ${equations.filter((n) => n.plot).length} plots`, preview: null,
        sparkline: plot?.samples.map(([x, y]) => [x / 10, y === null ? null : (y / plot.range[1] + 1) / 2]) };
    }
    if (!graph || vertices.length < 2 || !edges.length) return { ...cluster, category: 'freeform_notes', title: 'Freehand notes',
      primaryMetric: `${cluster.strokeIds.length} strokes`, secondaryBadge: 'Click or tap to explore', preview: null };
    const local = recomputeGraph({ ...graph, vertices, edges }, graph);
    const final = local.steps.dijkstra.at(-1)!;
    const cost = final.distances[local.targetVertexId];
    const source = vertices.find((v) => v.id === local.startVertexId)!.label;
    const target = vertices.find((v) => v.id === local.targetVertexId)!.label;
    const width = cluster.bbox.maxX - cluster.bbox.minX, height = cluster.bbox.maxY - cluster.bbox.minY;
    const indices = new Map(vertices.map((v, i) => [v.id, i]));
    return { ...cluster, category: 'graph_topology', title: 'Routing graph',
      primaryMetric: cost === 'INF' ? `No route ${source} → ${target}` : `Shortest path · ${cost}`,
      secondaryBadge: `${vertices.length} nodes · ${edges.length} connections`,
      preview: { vertices: vertices.map((v) => [(v.center.x - cluster.bbox.minX) / width, (v.center.y - cluster.bbox.minY) / height] as [number, number]),
        edges: edges.map((e) => [indices.get(e.sourceVertexId)!, indices.get(e.targetVertexId)!] as [number, number]) } };
  });
}
