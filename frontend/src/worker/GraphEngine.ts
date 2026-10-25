import RBush from 'rbush';
import type { BBox, InkStroke, Point } from '../types/canvas';
import type { GraphASTNode, GraphEdge, GraphSettings, GraphVertex } from '../types/graph';
import { classifyStroke, distance, union } from './heuristics';
import type { Geometry } from './heuristics';
import { DollarPRecognizer } from './DollarPRecognizer';
import { traversal } from './traversals';

type Entry = BBox & { id: string };
const expanded = (p: Point, radius: number): BBox => ({ minX: p.x - radius, minY: p.y - radius, maxX: p.x + radius, maxY: p.y + radius });
function label(index: number): string { return index < 26 ? String.fromCharCode(65 + index) : label(Math.floor(index / 26) - 1) + label(index % 26); }
const recognizer = new DollarPRecognizer();

function numberRows(strokes: InkStroke[], geometry: Map<string, Geometry>) {
  const groups: InkStroke[][] = [], seen = new Set<string>();
  const index = new RBush<Entry>(); index.load(strokes.map((s) => ({ ...geometry.get(s.id)!.box, id: s.id })));
  const byId = new Map(strokes.map((s) => [s.id, s]));
  for (const stroke of strokes) {
    if (seen.has(stroke.id)) continue;
    const group = [stroke]; seen.add(stroke.id);
    for (let i = 0; i < group.length; i++) {
      const box = geometry.get(group[i].id)!.box;
      const nearby = index.search({ minX: box.minX - 3, minY: box.minY - 3, maxX: box.maxX + 3, maxY: box.maxY + 3 });
      for (const entry of nearby) {
        if (seen.has(entry.id)) continue;
        const next = byId.get(entry.id)!;
        if (next.graphEdgeId !== stroke.graphEdgeId) continue;
        const overlap = Math.min(box.maxY, entry.maxY) - Math.max(box.minY, entry.minY);
        if (overlap < Math.min(box.maxY - box.minY, entry.maxY - entry.minY) * 0.3) continue;
        group.push(next); seen.add(entry.id);
      }
    }
    groups.push(group);
  }
  const glyphs = groups.flatMap((group) => {
    const box = union(group.map((s) => geometry.get(s.id)!.box));
    const tokens = [...new Set(group.map((s) => s.recognizedToken).filter(Boolean))];
    const token = tokens.length === 1 && /^[0-9.]$/.test(tokens[0]!) ? tokens[0]!
      : box.maxX - box.minX < 4 && box.maxY - box.minY < 4 ? '.'
        : recognizer.recognize(group.map((s) => s.points))?.token;
    return token ? [{ box, token, strokes: group, edgeId: group[0].graphEdgeId }] : [];
  }).sort((a, b) => a.box.minX - b.box.minX);
  const rows: typeof glyphs[] = [];
  for (const glyph of glyphs) {
    const row = rows.find((row) => {
      const last = row.at(-1)!, a = last.box, b = glyph.box;
      return last.edgeId === glyph.edgeId && b.minX - a.maxX <= 18
        && Math.abs((a.minY + a.maxY - b.minY - b.maxY) / 2) < Math.max(a.maxY - a.minY, b.maxY - b.minY) * 0.65 + 3;
    });
    if (row) row.push(glyph); else rows.push([glyph]);
  }
  return rows.flatMap((row) => {
    const text = row.map((g) => g.token).join(''), value = Number(text);
    if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(value) || value > 1e6) return [];
    return [{ value, box: union(row.map((g) => g.box)), strokes: row.flatMap((g) => g.strokes), edgeId: row[0].edgeId }];
  });
}

export function compileGraph(strokes: InkStroke[], settings: GraphSettings = {}, cached?: Map<string, Geometry>): GraphASTNode | null {
  const geometry = cached ?? new Map(strokes.map((s) => [s.id, classifyStroke(s)]));
  const vertices: GraphVertex[] = strokes.flatMap((stroke) => {
    const circle = geometry.get(stroke.id)?.circle;
    return circle ? [{ id: `vertex:${stroke.id}`, strokeId: stroke.id, label: '', ...circle, bbox: stroke.bbox }] : [];
  }).sort((a, b) => Math.round(a.center.x / 60) - Math.round(b.center.x / 60) || a.center.y - b.center.y || a.center.x - b.center.x || a.id.localeCompare(b.id));
  if (vertices.length < 2) return null;
  vertices.forEach((v, i) => { v.label = label(i); });
  const vertexMap = new Map(vertices.map((v) => [v.id, v]));
  const vertexIndex = new RBush<Entry>(); vertexIndex.load(vertices.map((v) => ({ ...v.bbox, id: v.id })));
  function nearest(point: Point) {
    return vertexIndex.search(expanded(point, 40)).map((v) => vertexMap.get(v.id)!)
      .filter((v) => distance(v.center, point) <= v.radius * 1.5 + 10)
      .sort((a, b) => distance(a.center, point) - distance(b.center, point) || a.id.localeCompare(b.id))[0];
  }
  const heads = strokes.filter((s) => geometry.get(s.id)?.chevron && !geometry.get(s.id)?.circle);
  const headIndex = new RBush<Entry>(); headIndex.load(heads.map((s) => ({ ...expanded(geometry.get(s.id)!.chevron!.tip, 1), id: s.id })));
  const used = new Set(vertices.map((v) => v.strokeId)), edges: GraphEdge[] = [];
  const candidates = strokes.filter((s) => !used.has(s.id) && s.semanticRole !== 'graph_weight')
    .sort((a, b) => geometry.get(b.id)!.length - geometry.get(a.id)!.length || a.id.localeCompare(b.id));
  for (const stroke of candidates) {
    const g = geometry.get(stroke.id)!;
    if (used.has(stroke.id) || g.length < 25 || g.chevron && !g.arrow) continue;
    let points = g.arrow?.shaft ?? g.points;
    if (distance(points[0], points.at(-1)!) < 25 || distance(points[0], points.at(-1)!) / g.length < 0.4) continue;
    let source = nearest(points[0]), target = nearest(points.at(-1)!);
    if (!source || !target || source.id === target.id) continue;
    let headStrokeId: string | undefined, directed = !!g.arrow;
    if (!directed) {
      for (const reverse of [false, true]) {
        const end = reverse ? points[0] : points.at(-1)!, before = reverse ? points[3] : points.at(-4)!;
        const tangent = { x: end.x - before.x, y: end.y - before.y }, norm = distance(end, before) || 1;
        const head = headIndex.search(expanded(end, 22)).filter((h) => !used.has(h.id) && h.id !== stroke.id)
          .map((h) => ({ id: h.id, ...geometry.get(h.id)!.chevron! }))
          .filter((h) => distance(h.tip, end) < 22 && (h.direction.x * tangent.x + h.direction.y * tangent.y) / norm > 0.35)
          .sort((a, b) => distance(a.tip, end) - distance(b.tip, end))[0];
        if (head) {
          headStrokeId = head.id; directed = true;
          if (reverse) { points = points.slice().reverse(); [source, target] = [target, source]; }
          break;
        }
      }
    }
    const midpoint = points[Math.floor(points.length / 2)];
    const weightBBox = { minX: midpoint.x - 12, maxX: midpoint.x + 12, minY: midpoint.y - 29, maxY: midpoint.y - 9 };
    edges.push({ id: `edge:${stroke.id}`, strokeId: stroke.id, headStrokeId, sourceVertexId: source.id, targetVertexId: target.id,
      directed, weight: 1, weightStrokeIds: [], weightBBox, controlPoints: points, midpoint });
    used.add(stroke.id); if (headStrokeId) used.add(headStrokeId);
  }
  if (!edges.length) return null;
  edges.sort((a, b) => a.id.localeCompare(b.id));
  const midpointIndex = new RBush<Entry>(); midpointIndex.load(edges.map((e) => ({ ...expanded(e.midpoint, 1), id: e.id })));
  const numericCandidates = strokes.filter((s) => {
    if (used.has(s.id)) return false;
    const b = geometry.get(s.id)!.box;
    return b.maxX - b.minX <= 40 && b.maxY - b.minY <= 50
      && (!!s.graphEdgeId || midpointIndex.search({ minX: b.minX - 35, maxX: b.maxX + 35, minY: b.minY - 35, maxY: b.maxY + 35 }).length > 0);
  });
  const assigned = new Set<string>();
  for (const row of numberRows(numericCandidates, geometry)) {
    const center = { x: (row.box.minX + row.box.maxX) / 2, y: (row.box.minY + row.box.maxY) / 2 };
    const edge = edges.filter((edge) => !assigned.has(edge.id) && (row.edgeId ? edge.id === row.edgeId : distance(center, edge.midpoint) <= 35))
      .sort((a, b) => distance(a.midpoint, center) - distance(b.midpoint, center))[0];
    if (edge) { edge.weight = row.value; edge.weightBBox = row.box; edge.weightStrokeIds = row.strokes.map((s) => s.id); assigned.add(edge.id); }
  }
  const strokeIds = new Set([...used, ...edges.flatMap((e) => e.weightStrokeIds)]);
  const graph: GraphASTNode = { kind: 'graph', id: 'graph:board', vertices, edges,
    bbox: union(strokes.filter((s) => strokeIds.has(s.id)).map((s) => s.bbox)),
    strokeIds: [...strokeIds],
    startVertexId: '', targetVertexId: '', steps: { bfs: [], dfs: [], dijkstra: [] } };
  return recomputeGraph(graph, settings);
}

export function recomputeGraph(graph: GraphASTNode, settings: GraphSettings, override?: { edgeId: string; value: number }): GraphASTNode {
  const startVertexId = graph.vertices.some((v) => v.id === settings.startVertexId) ? settings.startVertexId! : graph.vertices[0].id;
  const targetVertexId = graph.vertices.some((v) => v.id === settings.targetVertexId) ? settings.targetVertexId! : graph.vertices.at(-1)!.id;
  const edges = override ? graph.edges.map((e) => e.id === override.edgeId ? { ...e, weight: override.value } : e) : graph.edges;
  return { ...graph, edges, startVertexId, targetVertexId, steps: {
    bfs: traversal(graph.vertices, edges, 'bfs', startVertexId, targetVertexId),
    dfs: traversal(graph.vertices, edges, 'dfs', startVertexId, targetVertexId),
    dijkstra: traversal(graph.vertices, edges, 'dijkstra', startVertexId, targetVertexId),
  } };
}
