import { describe, expect, it } from 'vitest';
import { routingGraph } from '../presets/demoWorkspaces';
import { DIGIT_PATHS, numberInk } from '../presets/digits';
import type { InkStroke, Point } from '../types/canvas';
import { strokeBounds } from '../types/canvas';
import { DollarPRecognizer } from './DollarPRecognizer';
import { classifyStroke, resample } from './heuristics';
import { compileGraph, recomputeGraph } from './GraphEngine';

function ink(id: string, points: Point[]): InkStroke {
  const samples = points.map((p, i) => ({ ...p, t: i, pressure: 0.5 }));
  return { id, version: 1, createdAt: 0, authorId: 'test', color: '#444', size: 3, semanticRole: 'raw', points: samples, bbox: strokeBounds(samples, 3) };
}
function circle(id: string, x: number, y = 0) {
  return ink(id, Array.from({ length: 80 }, (_, i) => ({ x: x + Math.cos(i / 79 * Math.PI * 2) * 35, y: y + Math.sin(i / 79 * Math.PI * 2) * 35 })));
}
describe('geometry and handwritten digits', () => {
  it('resamples without mutating the source or producing NaN on taps', () => {
    const points = [{ x: 1, y: 2 }, { x: 11, y: 2 }];
    expect(resample(points, 3)).toEqual([{ x: 1, y: 2 }, { x: 6, y: 2 }, { x: 11, y: 2 }]);
    expect(points).toHaveLength(2); expect(resample([points[0]])).toHaveLength(64);
  });
  it('recognizes a loose circle while rejecting an open arc and a straight line', () => {
    expect(classifyStroke(circle('node', 0)).circle?.radius).toBeCloseTo(35, 0);
    expect(classifyStroke(ink('line', [{ x: 0, y: 0 }, { x: 100, y: 0 }])).circle).toBeUndefined();
    expect(classifyStroke(ink('arc', circle('c', 0).points.slice(0, 40))).circle).toBeUndefined();
  });
  it.each(Object.keys(DIGIT_PATHS))('recognizes translated, scaled and slightly perturbed digit %s', (digit) => {
    const recognizer = new DollarPRecognizer();
    const paths = DIGIT_PATHS[digit].map((path) => path.map(([x, y], i) => ({ x: 200 + x * 1.7 + Math.sin(i) * 0.05, y: -40 + y * 1.7 })));
    expect(recognizer.recognize(paths)?.token).toBe(digit);
    expect(recognizer.recognize(paths.map((path) => [...path].reverse()).reverse())?.token).toBe(digit);
  });
});
describe('graph compilation and traces', () => {
  it('compiles the real demo ink into seven vertices and eleven directed weighted edges', () => {
    const graph = compileGraph(routingGraph({ x: 0, y: 0 }))!;
    expect(graph.vertices.map((v) => v.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(graph.edges).toHaveLength(11); expect(graph.edges.every((e) => e.directed)).toBe(true);
    const last = graph.steps.dijkstra.at(-1)!;
    expect(last.distances[graph.targetVertexId]).toBe(11);
    expect(last.pathVertexIds.map((id) => graph.vertices.find((v) => v.id === id)!.label)).toEqual(['A', 'B', 'E', 'F', 'G']);
    expect(graph.steps.bfs.at(-1)!.pathEdgeIds).toHaveLength(3);
    expect(new Set(graph.steps.dfs.at(-1)!.visitedVertexIds).size).toBe(7);
  });
  it('recognizes demo digits without seeded tokens or weight bindings', () => {
    const strokes = routingGraph({ x: 0, y: 0 }).map((s) => ({ ...s, semanticRole: 'raw' as const, recognizedToken: undefined, graphEdgeId: undefined }));
    const graph = compileGraph(strokes)!;
    expect(graph.edges.map((e) => e.weight).sort()).toEqual([4, 3, 1, 5, 6, 2, 3, 1, 7, 2, 4].sort());
    expect(graph.steps.dijkstra.at(-1)!.distances[graph.targetVertexId]).toBe(11);
  });
  it('handles undirected edges, zero weights, decimals, and unreachable destinations', () => {
    const strokes = [circle('a', 0), circle('b', 200), circle('c', 400), ink('ab', [{ x: 40, y: 0 }, { x: 160, y: 0 }]),
      ...numberInk(0, { x: 100, y: -18 }, 'edge:ab')];
    const graph = compileGraph(strokes)!;
    expect(graph.edges[0].directed).toBe(false); expect(graph.edges[0].weight).toBe(0);
    expect(graph.steps.dijkstra.at(-1)!.description).toContain('No route');
    const back = recomputeGraph(graph, { startVertexId: 'vertex:b', targetVertexId: 'vertex:a' });
    expect(back.steps.dijkstra.at(-1)!.distances['vertex:a']).toBe(0);
    const decimal = compileGraph([...strokes.slice(0, 4), ...numberInk(12.5, { x: 100, y: -18 }, 'edge:ab')])!;
    expect(decimal.edges[0].weight).toBe(12.5);
  });
  it('recognizes a single-stroke arrow and respects direction', () => {
    const graph = compileGraph([circle('a', 0), circle('b', 200), ink('arrow', [{ x: 40, y: 0 }, { x: 160, y: 0 }, { x: 146, y: -10 }, { x: 160, y: 0 }, { x: 146, y: 10 }])])!;
    expect(graph.edges[0].directed).toBe(true);
    const reverse = recomputeGraph(graph, { startVertexId: 'vertex:b', targetVertexId: 'vertex:a' });
    expect(reverse.steps.dijkstra.at(-1)!.pathVertexIds).toEqual([]);
  });
  it('recomputes routes after a weight override and rejects negative weights', () => {
    const graph = compileGraph(routingGraph({ x: 0, y: 0 }))!;
    const ab = graph.edges.find((e) => e.sourceVertexId === graph.vertices[0].id && e.targetVertexId === graph.vertices[1].id)!;
    const changed = recomputeGraph(graph, {}, { edgeId: ab.id, value: 20 });
    expect(changed.steps.dijkstra.at(-1)!.distances[changed.targetVertexId]).toBe(12);
    expect(graph.edges.find((e) => e.id === ab.id)!.weight).toBe(4);
    expect(() => recomputeGraph(graph, {}, { edgeId: ab.id, value: -1 })).toThrow(/non-negative/);
  });
  it('is independent of stroke arrival order and survives deletion of a node', () => {
    const strokes = routingGraph({ x: 0, y: 0 }), graph = compileGraph(strokes)!;
    const reversed = compileGraph([...strokes].reverse())!;
    expect(reversed.steps.dijkstra.at(-1)).toEqual(graph.steps.dijkstra.at(-1));
    const removed = compileGraph(strokes.filter((s) => s.id !== graph.vertices[1].strokeId))!;
    expect(removed.vertices).toHaveLength(6);
    expect(removed.edges.every((e) => e.sourceVertexId !== graph.vertices[1].id && e.targetVertexId !== graph.vertices[1].id)).toBe(true);
  });
});
