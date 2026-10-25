import type { GraphSnapshot } from '../types/graph';
import { EMPTY_GRAPH } from '../types/graph';

export class GraphOverlay {
  snapshot: GraphSnapshot = EMPTY_GRAPH;
  hoveredEdgeId: string | null = null;
  preview: { edgeId: string; value: number } | null = null;
  private paths = new Map<string, Path2D>();
  private graph = this.snapshot.graph;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  set(snapshot: GraphSnapshot) {
    this.snapshot = snapshot;
    if (this.graph === snapshot.graph) return;
    this.graph = snapshot.graph; this.paths.clear();
    for (const edge of this.graph?.edges ?? []) {
      const path = new Path2D(); edge.controlPoints.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y));
      this.paths.set(edge.id, path);
    }
  }
  get visible() { return !!this.snapshot.graph; }
  get animating() { return this.snapshot.playing && !this.reducedMotion.matches; }
  draw(ctx: CanvasRenderingContext2D, zoom: number, now: number) {
    const { graph, algorithm, stepIndex, selectedEdgeId } = this.snapshot;
    if (!graph) return;
    const step = graph.steps[algorithm][stepIndex];
    const pathEdges = new Set(step?.pathEdgeIds), pathVertices = new Set(step?.pathVertexIds);
    const visited = new Set(step?.visitedVertexIds), frontier = new Set(step?.frontierVertexIds);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const edge of graph.edges) {
      const active = step?.activeEdgeId === edge.id, final = pathEdges.has(edge.id), selected = selectedEdgeId === edge.id;
      if (active || final || selected) {
        ctx.strokeStyle = final ? '#4a9692' : active ? '#c6754f' : '#92a7ba';
        ctx.lineWidth = (final ? 5 : 4) / zoom; ctx.globalAlpha = 0.75;
        const path = this.paths.get(edge.id); if (path) ctx.stroke(path);
        ctx.globalAlpha = 1;
        if (active && this.animating) {
          const p = edge.controlPoints[Math.floor((now % 1200) / 1200 * edge.controlPoints.length)];
          ctx.fillStyle = '#c6754f'; ctx.beginPath(); ctx.arc(p.x, p.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
        }
      }
      const box = edge.weightBBox, x = (box.minX + box.maxX) / 2, y = (box.minY + box.maxY) / 2;
      const value = this.preview?.edgeId === edge.id ? this.preview.value : edge.weight;
      const hovered = this.hoveredEdgeId === edge.id;
      const text = hovered ? `↕ ${value}` : String(value);
      ctx.font = `500 ${11 / zoom}px system-ui, sans-serif`;
      const width = ctx.measureText(text).width + 14 / zoom, height = 23 / zoom;
      ctx.fillStyle = selected || hovered ? '#e8f0f3' : '#f9fafbed';
      ctx.beginPath(); ctx.roundRect(x - width / 2, y - height / 2, width, height, 8 / zoom); ctx.fill();
      ctx.fillStyle = selected ? '#3a6676' : '#68707a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
    }
    for (const vertex of graph.vertices) {
      const final = pathVertices.has(vertex.id), seen = visited.has(vertex.id), queued = frontier.has(vertex.id);
      const start = vertex.id === graph.startVertexId, target = vertex.id === graph.targetVertexId;
      if (final || seen || queued) {
        ctx.fillStyle = final ? '#c6e3e45c' : seen ? '#e1e9f18c' : '#f6e5cf6b';
        ctx.beginPath(); ctx.arc(vertex.center.x, vertex.center.y, vertex.radius * 0.85, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = `500 ${14 / zoom}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = final ? '#347773' : '#414a54'; ctx.fillText(vertex.label, vertex.center.x, vertex.center.y);
      if (start || target) {
        ctx.fillStyle = start ? '#bc7557' : '#648b9c'; ctx.font = `500 ${8 / zoom}px system-ui, sans-serif`;
        ctx.fillText(start && target ? 'START / END' : start ? 'START' : 'END', vertex.center.x, vertex.center.y + 16 / zoom);
      }
      if (stepIndex > 0) {
        const cost = step?.distances[vertex.id], text = cost === 'INF' ? '∞' : String(cost ?? '∞');
        ctx.font = `500 ${10 / zoom}px ui-monospace, monospace`;
        ctx.fillStyle = '#f9fafb';
        ctx.beginPath(); ctx.roundRect(vertex.center.x - 21 / zoom, vertex.center.y - vertex.radius - 23 / zoom, 42 / zoom, 19 / zoom, 7 / zoom); ctx.fill();
        ctx.fillStyle = final ? '#347773' : '#838b95'; ctx.fillText(`d ${text}`, vertex.center.x, vertex.center.y - vertex.radius - 13 / zoom);
      }
    }
    ctx.restore();
  }
}
