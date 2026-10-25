import type { BoardChange, InkStroke, Point } from '../types/canvas';
import type { Algorithm, GraphEdge, GraphSettings, GraphSnapshot } from '../types/graph';
import { EMPTY_GRAPH } from '../types/graph';
import type { InkWorkerRequest, InkWorkerResponse } from '../types/workerMessages';
import { numberInk } from '../presets/digits';
import { BoardStore } from './BoardStore';

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export class GraphController {
  private worker: Worker | null = null;
  private state: GraphSnapshot = { ...EMPTY_GRAPH };
  private listeners = new Set<() => void>();
  private revision = 0;
  private pending = new Map<string, InkStroke | null>();
  private compileTimer = 0;
  private playTimer = 0;
  private previewFrame = 0;
  private settings: GraphSettings = {};
  private scrub: { edge: GraphEdge; startY: number; value: number } | null = null;
  private showResult = false;
  private weightCommit = false;
  private unsubscribe: () => void;
  private events = new AbortController();
  hoverEdgeId: string | null = null;

  constructor(private store: BoardStore, private update: (snapshot: GraphSnapshot) => void, private invalidate: () => void) {
    this.unsubscribe = store.subscribe(this.changed);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, { signal: this.events.signal });
    this.retry();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private emit(patch: Partial<GraphSnapshot>) {
    this.state = { ...this.state, ...patch }; this.update(this.state); this.listeners.forEach((listener) => listener());
  }
  retry = () => {
    this.worker?.terminate(); window.clearTimeout(this.compileTimer); this.pause();
    this.pending.clear(); this.store.strokes.forEach((s) => this.pending.set(s.id, s));
    this.revision++;
    try {
      this.worker = new Worker(new URL('../worker/inkWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<InkWorkerResponse>) => {
        const response = event.data;
        if (response.revision !== this.revision) return;
        if (response.type === 'error') { this.emit({ processing: false, error: response.message, playing: false }); return; }
        const graph = response.graph;
        if (graph) this.settings = { startVertexId: graph.startVertexId, targetVertexId: graph.targetVertexId };
        const selectedEdgeId = graph?.edges.some((e) => e.id === this.state.selectedEdgeId) ? this.state.selectedEdgeId : null;
        const stepIndex = graph && this.showResult ? graph.steps[this.state.algorithm].length - 1 : 0;
        this.emit({ graph, stepIndex, selectedEdgeId, processing: false, error: null, workerMs: response.elapsedMs });
      };
      this.worker.onerror = (event) => {
        event.preventDefault(); this.worker?.terminate(); this.worker = null; this.pause();
        this.emit({ graph: null, processing: false, error: 'Graph recognition could not start. Drawing is still available.' });
      };
      this.flush();
    } catch {
      this.emit({ processing: false, error: 'Graph recognition is unavailable in this browser. Drawing still works.' });
    }
  };
  private send(message: InkWorkerRequest) {
    this.emit({ processing: true, error: null }); this.worker?.postMessage(message);
  }
  private changed = (change: BoardChange) => {
    this.pause(); this.showResult = this.weightCommit;
    window.cancelAnimationFrame(this.previewFrame); this.previewFrame = 0; this.scrub = null;
    change.removed.forEach((s) => this.pending.set(s.id, null)); change.added.forEach((s) => this.pending.set(s.id, s));
    this.revision++; this.emit({ processing: !!this.worker, stepIndex: 0,
      ...(!this.store.strokes.size ? { graph: null, selectedEdgeId: null } : {}) });
    window.clearTimeout(this.compileTimer); this.compileTimer = window.setTimeout(this.flush, 120);
  };
  private flush = () => {
    window.clearTimeout(this.compileTimer);
    const added: InkStroke[] = [], removedIds: string[] = [];
    this.pending.forEach((stroke, id) => stroke ? added.push(stroke) : removedIds.push(id)); this.pending.clear();
    if (this.worker) this.send({ type: 'compile', revision: this.revision, added, removedIds, settings: this.settings });
  };
  private requestTraversal(override?: { edgeId: string; value: number }) {
    this.revision++;
    if (this.pending.size) this.flush();
    else if (this.worker) this.send({ type: 'traverse', revision: this.revision, settings: this.settings, override });
  }
  selectAlgorithm(algorithm: Algorithm) { this.pause(); this.showResult = false; this.emit({ algorithm, stepIndex: 0 }); }
  setEndpoint(which: 'startVertexId' | 'targetVertexId', id: string) {
    this.pause(); this.showResult = false; this.settings[which] = id; this.requestTraversal();
  }
  selectEdge(id: string | null) { this.emit({ selectedEdgeId: id }); }
  step(index: number) {
    this.pause();
    const total = this.state.graph?.steps[this.state.algorithm].length ?? 1;
    const stepIndex = Math.max(0, Math.min(total - 1, index));
    this.showResult = stepIndex === total - 1; this.emit({ stepIndex });
  }
  private tick = () => {
    if (!this.state.playing || !this.state.graph) return;
    const last = this.state.graph.steps[this.state.algorithm].length - 1;
    const stepIndex = Math.min(last, this.state.stepIndex + 1), playing = stepIndex < last;
    this.showResult = !playing; this.emit({ stepIndex, playing });
    if (playing) this.playTimer = window.setTimeout(this.tick, 550);
  };
  togglePlayback() {
    if (this.state.playing) { this.pause(); return; }
    const trace = this.state.graph?.steps[this.state.algorithm];
    if (!trace?.length || this.state.processing || this.state.error) return;
    const stepIndex = this.state.stepIndex >= trace.length - 1 ? 0 : this.state.stepIndex;
    this.showResult = false; this.emit({ playing: true, stepIndex }); this.playTimer = window.setTimeout(this.tick, 550);
  }
  pause() { window.clearTimeout(this.playTimer); if (this.state.playing) this.emit({ playing: false }); }
  setWeight(edgeId: string, value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 1e6) throw new RangeError('Enter a weight between 0 and 1,000,000.');
    const edge = this.state.graph?.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const rounded = Number(value.toFixed(3));
    const original = edge.weightStrokeIds.map((id) => this.store.strokes.get(id)).filter((s): s is InkStroke => !!s);
    const center = { x: (edge.weightBBox.minX + edge.weightBBox.maxX) / 2, y: (edge.weightBBox.minY + edge.weightBBox.maxY) / 2 };
    this.weightCommit = true;
    try { this.store.replace(original, numberInk(rounded, center, edgeId)); } finally { this.weightCommit = false; }
  }
  private hitWeight(point: Point, zoom: number) {
    return this.state.graph?.edges.find((e) => {
      if (zoom < 0.5 && e.id !== this.state.selectedEdgeId) return false;
      const b = e.weightBBox, pad = 9 / zoom;
      return point.x >= b.minX - pad && point.x <= b.maxX + pad && point.y >= b.minY - pad && point.y <= b.maxY + pad;
    });
  }
  hover(point: Point, zoom: number) {
    const id = this.hitWeight(point, zoom)?.id ?? null;
    if (id !== this.hoverEdgeId) { this.hoverEdgeId = id; this.invalidate(); }
    return !!id;
  }
  pointerDown(screen: Point, world: Point, zoom: number, shift: boolean) {
    this.pause();
    const weight = this.hitWeight(world, zoom);
    if (weight && !this.state.processing) {
      this.scrub = { edge: weight, startY: screen.y, value: weight.weight }; this.emit({ selectedEdgeId: weight.id }); return;
    }
    const vertex = this.state.graph?.vertices.find((v) => Math.hypot(v.center.x - world.x, v.center.y - world.y) < v.radius + 8 / zoom);
    if (vertex) { this.setEndpoint(shift ? 'targetVertexId' : 'startVertexId', vertex.id); return; }
    const edge = this.state.graph?.edges.find((e) => e.controlPoints.some((p, i, points) => i > 0 && segmentDistance(world, points[i - 1], p) < 9 / zoom));
    this.selectEdge(edge?.id ?? null);
  }
  pointerMove(screen: Point) {
    if (!this.scrub) return;
    const value = Number(Math.max(0, Math.min(1e6, this.scrub.edge.weight - (screen.y - this.scrub.startY) * 0.05)).toFixed(3));
    if (value === this.scrub.value) return;
    this.scrub.value = value; this.showResult = true;
    // Invalidate stale worker results immediately; coalesce calculation requests to a frame.
    this.revision++; this.invalidate();
    if (!this.previewFrame) this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = 0;
      if (this.scrub && this.worker) this.send({ type: 'traverse', revision: this.revision, settings: this.settings, override: { edgeId: this.scrub.edge.id, value: this.scrub.value } });
    });
  }
  pointerUp(cancel = false) {
    const scrub = this.scrub;
    if (!scrub) return;
    this.scrub = null; window.cancelAnimationFrame(this.previewFrame); this.previewFrame = 0;
    if (!cancel && scrub.value !== scrub.edge.weight) this.setWeight(scrub.edge.id, scrub.value);
    else { this.requestTraversal(); this.invalidate(); }
  }
  get weightPreview() { return this.scrub ? { edgeId: this.scrub.edge.id, value: this.scrub.value } : null; }
  dispose() {
    this.unsubscribe(); window.clearTimeout(this.compileTimer); window.clearTimeout(this.playTimer);
    window.cancelAnimationFrame(this.previewFrame); this.events.abort(); this.worker?.terminate(); this.listeners.clear();
  }
}
