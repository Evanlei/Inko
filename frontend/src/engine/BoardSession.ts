import { BoardPersistence } from '../storage/BoardPersistence';
import type { SaveStatus } from '../storage/BoardPersistence';
import type { BoardMeta, Tool } from '../types/canvas';
import { BoardStore } from './BoardStore';
import { Camera } from './Camera';
import { Renderer } from './Renderer';
import type { Metrics } from './Renderer';
import { InputController } from './InputController';
import { sampleSketch } from '../presets/sketch';

interface Callbacks {
  save: (status: SaveStatus) => void;
  camera: (zoom: number) => void;
  metrics: (metrics: Metrics) => void;
  tool: (tool: Tool) => void;
  help: () => void;
}
export class BoardSession {
  readonly store = new BoardStore();
  readonly camera = new Camera();
  readonly renderer: Renderer;
  readonly input: InputController;
  title = 'Untitled space';
  private metaTimer = 0;
  private unsubscribe: () => void;
  private events = new AbortController();
  private constructor(canvas: HTMLCanvasElement, private persistence: BoardPersistence | null, callbacks: Callbacks,
    initial: Awaited<ReturnType<BoardPersistence['load']>>) {
    if (initial.meta) { this.title = initial.meta.title; this.camera.restore(initial.meta.camera); }
    this.store.hydrate(initial.strokes);
    this.renderer = new Renderer(canvas, this.camera, this.store, callbacks.metrics);
    initial.strokes.forEach((stroke) => this.renderer.cache.get(stroke));
    this.input = new InputController(canvas, this.camera, this.store, this.renderer, () => {
      callbacks.camera(this.camera.zoom);
      window.clearTimeout(this.metaTimer);
      this.metaTimer = window.setTimeout(this.saveMeta, 250);
    }, callbacks.tool, callbacks.help);
    this.unsubscribe = this.store.subscribe((change) => {
      change.removed.forEach((stroke) => this.renderer.cache.remove(stroke.id));
      // Tessellate committed ink once at mutation time, rather than on every paint.
      change.added.forEach((stroke) => this.renderer.cache.get(stroke));
      this.renderer.invalidate(); this.persistence?.save(change, this.meta());
    });
    const signal = this.events.signal;
    document.addEventListener('visibilitychange', this.saveMeta, { signal });
    window.addEventListener('pagehide', this.saveMeta, { signal });
    callbacks.camera(this.camera.zoom);
  }
  static async create(canvas: HTMLCanvasElement, callbacks: Callbacks) {
    let persistence: BoardPersistence | null = null;
    let initial: Awaited<ReturnType<BoardPersistence['load']>> = { strokes: [], meta: null };
    try { persistence = await BoardPersistence.open(callbacks.save); initial = await persistence.load(); callbacks.save('saved'); }
    catch { persistence?.close(); persistence = null; callbacks.save('error'); }
    return new BoardSession(canvas, persistence, callbacks, initial);
  }
  private meta(): BoardMeta { return { title: this.title, camera: this.camera.serialize() }; }
  private saveMeta = () => { window.clearTimeout(this.metaTimer); this.persistence?.save({ added: [], removed: [] }, this.meta()); };
  rename(title: string) { this.title = title.slice(0, 80); this.saveMeta(); }
  addSketch() {
    const center = this.camera.screenToWorld({ x: this.renderer.width / 2, y: this.renderer.height / 2 });
    this.store.add(sampleSketch(center)); this.input.fit();
  }
  async export() {
    const blob = await this.renderer.exportPng(), url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${this.title.trim() || 'inko-space'}.png`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose() {
    this.input.dispose(); this.saveMeta(); this.unsubscribe(); this.events.abort();
    this.renderer.dispose(); this.persistence?.close();
  }
}
