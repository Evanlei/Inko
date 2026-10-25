import { Camera } from './Camera';
import { BoardStore } from './BoardStore';
import { PathCache } from './PathCache';
import { GraphOverlay } from './GraphOverlay';
import type { InkStroke, Point, Tool } from '../types/canvas';

export interface Metrics { visible: number; total: number; paintMs: number }
export class Renderer {
  readonly cache = new PathCache();
  readonly overlay = new GraphOverlay();
  syncGraphInteraction = () => {};
  activeStroke: InkStroke | null = null;
  cursor: (Point & { tool: Tool }) | null = null;
  width = 0;
  height = 0;
  private frame = 0;
  private dpr = 1;
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private lastMetrics = 0;
  private metricsTimer = 0;
  private pendingMetrics: Metrics | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly camera: Camera, readonly store: BoardStore, private onMetrics: (metrics: Metrics) => void) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser does not support Canvas2D');
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
  }
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.invalidate();
  };
  invalidate = () => { if (!this.frame) this.frame = requestAnimationFrame(this.render); };
  private grid() {
    const ctx = this.ctx, camera = this.camera;
    let spacing = 24 * camera.zoom;
    while (spacing < 16) spacing *= 2;
    while (spacing > 40) spacing /= 2;
    ctx.fillStyle = '#d8dcd2';
    ctx.beginPath();
    for (let x = ((camera.x % spacing) + spacing) % spacing; x < this.width; x += spacing) {
      for (let y = ((camera.y % spacing) + spacing) % spacing; y < this.height; y += spacing) {
        ctx.moveTo(x + 0.8, y); ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  private welcome() {
    const ctx = this.ctx, x = this.width / 2 + (this.width < 650 ? 28 : 0), y = this.height / 2 - 32;
    const mobile = this.width < 650;
    const fontSize = mobile ? Math.min(33, (this.width - 112) / 9.1) : 52;
    ctx.save();
    // The empty-state artwork lives on the same canvas as the ink.
    ctx.fillStyle = '#f7f7f2';
    ctx.fillRect(x - Math.min(350, this.width / 2 - 28), y - 90, Math.min(700, this.width - 56), 205);
    ctx.fillStyle = '#8b9384';
    ctx.textAlign = 'center'; ctx.font = '500 11px ui-monospace, monospace';
    ctx.fillText('AN OPEN SPACE FOR YOUR NEXT IDEA', x, y - 39);
    ctx.fillStyle = '#303c35'; ctx.font = `${fontSize}px Georgia, serif`;
    ctx.fillText('A little ink.', x, y + 17);
    ctx.font = `italic ${fontSize}px Georgia, serif`;
    ctx.fillText('Endless possibilities.', x, y + (mobile ? 58 : 78));
    ctx.strokeStyle = '#b6cb77'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 72, y + 27); ctx.quadraticCurveTo(x, y + 34, x + 76, y + 26); ctx.stroke();
    ctx.fillStyle = '#7d8578'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Pick up the pen. The canvas is yours.', x, y + (mobile ? 105 : 125));
    ctx.restore();
  }
  private render = (now: number) => {
    this.frame = 0;
    const start = performance.now(), ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#f7f7f2'; ctx.fillRect(0, 0, this.width, this.height);
    this.grid();
    const ids = this.store.index.search(this.camera.viewport(this.width, this.height));
    const visible = ids.map((id) => this.store.strokes.get(id)!).sort((a, b) => a.createdAt - b.createdAt);
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y); ctx.scale(this.camera.zoom, this.camera.zoom);
    for (const stroke of visible) { ctx.fillStyle = stroke.color; ctx.fill(this.cache.get(stroke)); }
    if (this.activeStroke) { ctx.fillStyle = this.activeStroke.color; ctx.fill(this.cache.preview(this.activeStroke)); }
    this.syncGraphInteraction(); this.overlay.draw(ctx, this.camera.zoom, now);
    ctx.restore();
    if (!this.store.strokes.size && !this.activeStroke) this.welcome();
    if (this.cursor?.tool === 'eraser') {
      ctx.fillStyle = '#ffffff90'; ctx.strokeStyle = '#65715a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    this.pendingMetrics = { visible: visible.length, total: this.store.strokes.size, paintMs: performance.now() - start };
    if (now - this.lastMetrics > 200) this.publishMetrics();
    else if (!this.metricsTimer) this.metricsTimer = window.setTimeout(this.publishMetrics, 200);
    if (this.overlay.animating) this.invalidate();
  };
  private publishMetrics = () => {
    window.clearTimeout(this.metricsTimer); this.metricsTimer = 0; this.lastMetrics = performance.now();
    if (this.pendingMetrics) { this.onMetrics(this.pendingMetrics); this.pendingMetrics = null; }
  };
  async exportPng(): Promise<Blob> {
    const box = this.store.bounds();
    if (!box) throw new Error('Draw something before exporting.');
    const padding = 48, width = box.maxX - box.minX + padding * 2, height = box.maxY - box.minY + padding * 2;
    const scale = Math.min(2, 4096 / Math.max(width, height));
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.ceil(width * scale)); output.height = Math.max(1, Math.ceil(height * scale));
    const ctx = output.getContext('2d')!;
    ctx.fillStyle = '#f7f7f2'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.scale(scale, scale); ctx.translate(padding - box.minX, padding - box.minY);
    for (const stroke of [...this.store.strokes.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      ctx.fillStyle = stroke.color; ctx.fill(this.cache.get(stroke));
    }
    this.overlay.draw(ctx, scale, performance.now());
    return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not export the drawing.')), 'image/png'));
  }
  dispose() {
    window.clearTimeout(this.metricsTimer);
    cancelAnimationFrame(this.frame); this.observer.disconnect();
    window.removeEventListener('resize', this.resize);
  }
}
