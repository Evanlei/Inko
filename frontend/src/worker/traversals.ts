import type { Algorithm, AlgorithmStep, GraphEdge, GraphVertex } from '../types/graph';

interface Neighbor { id: string; edge: GraphEdge }
class MinHeap {
  private items: { id: string; cost: number; rank: number }[] = [];
  private before(a: typeof this.items[number], b: typeof this.items[number]) { return a.cost < b.cost || (a.cost === b.cost && a.rank < b.rank); }
  push(value: typeof this.items[number]) {
    this.items.push(value);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(this.items[i], this.items[parent])) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]]; i = parent;
    }
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (!this.items.length || !last) return first;
    this.items[0] = last;
    let i = 0;
    while (true) {
      const left = i * 2 + 1, right = left + 1;
      let best = i;
      if (left < this.items.length && this.before(this.items[left], this.items[best])) best = left;
      if (right < this.items.length && this.before(this.items[right], this.items[best])) best = right;
      if (best === i) break;
      [this.items[i], this.items[best]] = [this.items[best], this.items[i]]; i = best;
    }
    return first;
  }
  frontier(settled: Set<string>) { return [...new Set(this.items.filter((n) => !settled.has(n.id)).sort((a, b) => a.cost - b.cost || a.rank - b.rank).map((n) => n.id))]; }
  get size() { return this.items.length; }
}

export function traversal(vertices: GraphVertex[], edges: GraphEdge[], algorithm: Algorithm, start: string, target: string): AlgorithmStep[] {
  if (!vertices.some((v) => v.id === start) || !vertices.some((v) => v.id === target)) return [];
  if (edges.some((edge) => !Number.isFinite(edge.weight) || edge.weight < 0)) throw new Error('Edge weights must be finite and non-negative.');
  const labels = new Map(vertices.map((v) => [v.id, v.label])), ranks = new Map(vertices.map((v, i) => [v.id, i]));
  const adjacency = new Map<string, Neighbor[]>(vertices.map((v) => [v.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.sourceVertexId)?.push({ id: edge.targetVertexId, edge });
    if (!edge.directed) adjacency.get(edge.targetVertexId)?.push({ id: edge.sourceVertexId, edge });
  }
  adjacency.forEach((neighbors) => neighbors.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)! || a.edge.id.localeCompare(b.edge.id)));
  const costs = new Map(vertices.map((v) => [v.id, Infinity])); costs.set(start, 0);
  const visited = new Set<string>(), parents = new Map<string, { vertex: string; edge: string }>();
  const steps: AlgorithmStep[] = [];
  function snapshot(phase: AlgorithmStep['phase'], frontier: string[], description: string, activeEdgeId?: string, pathVertexIds: string[] = [], pathEdgeIds: string[] = []) {
    steps.push({ stepIndex: steps.length, phase, visitedVertexIds: [...visited], frontierVertexIds: [...new Set(frontier)],
      activeEdgeId, pathVertexIds, pathEdgeIds, distances: Object.fromEntries([...costs].map(([id, cost]) => [id, Number.isFinite(cost) ? cost : 'INF'])), description });
  }
  snapshot('ready', [start], `Start at ${labels.get(start)}`);
  if (algorithm === 'dijkstra') {
    const queue = new MinHeap(); queue.push({ id: start, cost: 0, rank: ranks.get(start)! });
    while (queue.size) {
      const current = queue.pop()!;
      if (visited.has(current.id) || current.cost !== costs.get(current.id)) continue;
      visited.add(current.id);
      snapshot('visit', queue.frontier(visited), `Visit ${labels.get(current.id)} · cost ${current.cost}`);
      for (const next of adjacency.get(current.id)!) {
        if (visited.has(next.id)) continue;
        const candidate = current.cost + next.edge.weight;
        if (candidate < costs.get(next.id)!) {
          costs.set(next.id, candidate); parents.set(next.id, { vertex: current.id, edge: next.edge.id });
          queue.push({ id: next.id, cost: candidate, rank: ranks.get(next.id)! });
          snapshot('relax', queue.frontier(visited), `${labels.get(current.id)} → ${labels.get(next.id)} · cost ${candidate}`, next.edge.id);
        }
      }
    }
  } else if (algorithm === 'bfs') {
    const queue = [start], discovered = new Set([start]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]; visited.add(current);
      snapshot('visit', queue.slice(i + 1), `Visit ${labels.get(current)} · ${costs.get(current)} hops`);
      for (const next of adjacency.get(current)!) {
        if (discovered.has(next.id)) continue;
        discovered.add(next.id); queue.push(next.id); costs.set(next.id, costs.get(current)! + 1);
        parents.set(next.id, { vertex: current, edge: next.edge.id });
        snapshot('relax', queue.slice(i + 1), `Queue ${labels.get(next.id)}`, next.edge.id);
      }
    }
  } else {
    const stack: { id: string; parent?: string; edge?: string; depth: number }[] = [{ id: start, depth: 0 }];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id); costs.set(current.id, current.depth);
      if (current.parent && current.edge) parents.set(current.id, { vertex: current.parent, edge: current.edge });
      snapshot('visit', stack.slice().reverse().filter((v) => !visited.has(v.id)).map((v) => v.id), `Visit ${labels.get(current.id)} · depth ${current.depth}`, current.edge);
      for (const next of adjacency.get(current.id)!.slice().reverse()) {
        if (!visited.has(next.id)) stack.push({ id: next.id, parent: current.id, edge: next.edge.id, depth: current.depth + 1 });
      }
    }
  }
  const pathVertices: string[] = [], pathEdges: string[] = [];
  if (visited.has(target)) {
    let current = target; pathVertices.push(current);
    while (current !== start) {
      const parent = parents.get(current);
      if (!parent) break;
      pathEdges.push(parent.edge); current = parent.vertex; pathVertices.push(current);
    }
    pathVertices.reverse(); pathEdges.reverse();
  }
  const route = pathVertices.map((id) => labels.get(id)).join(' → ');
  const description = !pathVertices.length ? `No route from ${labels.get(start)} to ${labels.get(target)}`
    : algorithm === 'dijkstra' ? `Shortest path ${route} · cost ${costs.get(target)}`
      : `${algorithm.toUpperCase()} path ${route} · ${pathEdges.length} hops`;
  snapshot('complete', [], description, undefined, pathVertices, pathEdges);
  return steps;
}
