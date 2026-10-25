import { describe, expect, it } from 'vitest';
import type { InkStroke } from '../types/canvas';
import { inkOpacity } from '../types/semantic';
import { routingGraph } from '../presets/demoWorkspaces';
import { InkClustering, bboxDistance } from './dbscan';
import { compileGraph, recomputeGraph } from './GraphEngine';
import { summarize } from './semantic';

function dot(id: string, x: number, y = 0): InkStroke {
  return { id, authorId: 'test', version: 1, createdAt: 0, points: [{ x, y, pressure: 0.5, t: 0 }],
    bbox: { minX: x, maxX: x, minY: y, maxY: y }, color: '#444', size: 1, semanticRole: 'raw' };
}
const members = (engine: InkClustering, added: InkStroke[] = [], removed: string[] = []) =>
  engine.update(added, removed).map((c) => c.strokeIds);

describe('incremental bounding-box DBSCAN', () => {
  it('uses Euclidean box separation, including diagonal and touching boxes', () => {
    expect(bboxDistance(dot('a', 0).bbox, dot('b', 3, 4).bbox)).toBe(5);
    expect(bboxDistance(dot('a', 0).bbox, dot('b', 0).bbox)).toBe(0);
    const engine = new InkClustering(5);
    expect(members(engine, [dot('a', 0), dot('b', 4, 4)])).toEqual([]);
    expect(members(engine, [dot('b', 3, 4)])).toEqual([['a', 'b']]);
  });
  it('merges, splits and restores connected workspaces when a bridge changes', () => {
    const engine = new InkClustering(10);
    expect(members(engine, [dot('a', 0), dot('b', 5), dot('d', 25), dot('e', 30), dot('noise', 100)])).toEqual([['a', 'b'], ['d', 'e']]);
    expect(members(engine, [dot('bridge', 15)])).toEqual([['a', 'b', 'bridge', 'd', 'e']]);
    expect(members(engine, [], ['bridge'])).toEqual([['a', 'b'], ['d', 'e']]);
    expect(members(engine, [dot('bridge', 15)])).toEqual([['a', 'b', 'bridge', 'd', 'e']]);
    expect(members(engine, [dot('bridge', 200)])).toEqual([['a', 'b'], ['d', 'e']]);
    expect(members(engine, [], ['a', 'b', 'd', 'e', 'noise', 'bridge'])).toEqual([]);
  });
  it('includes border points without allowing them to expand a cluster', () => {
    const engine = new InkClustering(10, 4);
    expect(members(engine, [dot('border', 0), dot('core1', 9), dot('core2', 10.5), dot('core3', 11), dot('noise', -9)]))
      .toEqual([['border', 'core1', 'core2', 'core3']]);
  });
  it('produces stable ids and membership independent of arrival order', () => {
    const strokes = [dot('b', 1), dot('a', 0), dot('c', 500), dot('d', 510)];
    expect(new InkClustering().update(strokes, [])).toEqual(new InkClustering().update([...strokes].reverse(), []));
  });
});
describe('semantic summaries and zoom', () => {
  it('cross-fades continuously at the specified thresholds', () => {
    expect(inkOpacity(0.05)).toBe(0); expect(inkOpacity(0.18)).toBe(0);
    expect(inkOpacity(0.28)).toBeCloseTo(0.5); expect(inkOpacity(0.38)).toBe(1); expect(inkOpacity(5)).toBe(1);
  });
  it('derives live shortest paths without changing canonical ink', () => {
    const strokes = routingGraph({ x: 0, y: 0 }), original = JSON.stringify(strokes);
    const clusters = new InkClustering().update(strokes, []), graph = compileGraph(strokes)!;
    const summaries = summarize(clusters, graph);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].primaryMetric).toBe('Shortest path · 11');
    expect(summaries[0].secondaryBadge).toBe('7 nodes · 11 connections');
    expect(summaries[0].preview?.vertices).toHaveLength(7); expect(summaries[0].preview?.edges).toHaveLength(11);
    const ab = graph.edges.find((e) => e.sourceVertexId === graph.vertices[0].id && e.targetVertexId === graph.vertices[1].id)!;
    expect(summarize(clusters, recomputeGraph(graph, {}, { edgeId: ab.id, value: 20 }))[0].primaryMetric).toBe('Shortest path · 12');
    const reversed = recomputeGraph(graph, { startVertexId: graph.targetVertexId, targetVertexId: graph.startVertexId });
    expect(summarize(clusters, reversed)[0].primaryMetric).toBe('No route G → A');
    expect(JSON.stringify(strokes)).toBe(original);
  });
  it('keeps distant notes separate and summarizes disconnected graphs locally', () => {
    const strokes = [...routingGraph({ x: 0, y: 0 }), ...routingGraph({ x: 2500, y: 0 }), dot('note1', 5000), dot('note2', 5010)];
    const summaries = summarize(new InkClustering().update(strokes, []), compileGraph(strokes));
    expect(summaries).toHaveLength(3);
    expect(summaries.filter((s) => s.category === 'graph_topology').map((s) => s.primaryMetric)).toEqual(['Shortest path · 11', 'Shortest path · 11']);
    expect(summaries.find((s) => s.category === 'freeform_notes')?.primaryMetric).toBe('2 strokes');
  });
});
