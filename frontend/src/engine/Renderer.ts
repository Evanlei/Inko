import { Camera } from './Camera';
import { BoardStore } from './BoardStore';
import { PathCache } from './PathCache';
import { GraphOverlay } from './GraphOverlay';
import { SemanticOverlay } from './SemanticOverlay';
import { inkOpacity } from '../types/semantic';
import { MathOverlay } from './MathOverlay';
import { union } from '../worker/heuristics';
import type { InkStroke, Point, Tool } from '../types/canvas';

export interface Metrics { visible: number; total: number; paintMs: number }
export class Renderer {
  readonly cache = new PathCache();
  readonly overlay = new GraphOverlay();
  readonly semantic = new SemanticOverlay();
  readonly math = new MathOverlay();
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
  private warmGlow: CanvasGradient | null = null;
  private coolGlow: CanvasGradient | null = null;

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
    this.warmGlow = this.ctx.createRadialGradient(this.width * 0.87, 0, 0, this.width * 0.87, 0, this.width * 0.6);
    this.warmGlow.addColorStop(0, '#e8c6ac27'); this.warmGlow.addColorStop(1, '#e8c6ac00');
    this.coolGlow = this.ctx.createRadialGradient(0, this.height, 0, 0, this.height, this.width * 0.65);
    this.coolGlow.addColorStop(0, '#b5d6e42c'); this.coolGlow.addColorStop(1, '#b5d6e400');
    this.invalidate();
  };
  invalidate = () => { if (!this.frame) this.frame = requestAnimationFrame(this.render); };
  private grid() {
    const ctx = this.ctx, camera = this.camera;
    let spacing = 24 * camera.zoom;
    while (spacing < 16) spacing *= 2;
    while (spacing > 40) spacing /= 2;
    ctx.fillStyle = '#d3d8df';
    ctx.beginPath();
    for (let x = ((camera.x % spacing) + spacing) % spacing; x < this.width; x += spacing) {
      for (let y = ((camera.y % spacing) + spacing) % spacing; y < this.height; y += spacing) {
        ctx.moveTo(x + 0.55, y); ctx.arc(x, y, 0.55, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  private welcome() {
    const ctx = this.ctx, x = this.width / 2 + (this.width < 650 ? 28 : 0), y = this.height / 2 - 32;
    const mobile = this.width < 650;
    ctx.save();
    ctx.textAlign = 'center'; ctx.fillStyle = '#747d88'; ctx.font = `300 ${mobile ? 29 : 40}px system-ui, sans-serif`;
    ctx.fillText('Start with a line.', x, y);
    ctx.fillStyle = '#a1a8b1'; ctx.font = `${mobile ? 11 : 12}px system-ui, sans-serif`;
    if (mobile) {
      ctx.fillText('Draw circles and connect them.', x, y + 33);
      ctx.fillText('Or choose a workspace from Examples.', x, y + 52);
    } else ctx.fillText('Draw circles, connect them, and find a way through.', x, y + 36);
    ctx.restore();
  }
  private render = (now: number) => {
    this.frame = 0;
    const start = performance.now(), ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, this.width, this.height);
    if (this.warmGlow) { ctx.fillStyle = this.warmGlow; ctx.fillRect(0, 0, this.width, this.height); }
    if (this.coolGlow) { ctx.fillStyle = this.coolGlow; ctx.fillRect(0, 0, this.width, this.height); }
    this.grid();
    const ids = this.store.index.search(this.camera.viewport(this.width, this.height));
    const visible = ids.map((id) => this.store.strokes.get(id)!).sort((a, b) => a.createdAt - b.createdAt);
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y); ctx.scale(this.camera.zoom, this.camera.zoom);
    const alpha = inkOpacity(this.camera.zoom);
    for (const stroke of visible) {
      ctx.globalAlpha = this.semantic.members.has(stroke.id) ? alpha : 1;
      if (ctx.globalAlpha <= 0.01) continue;
      ctx.fillStyle = stroke.color; ctx.fill(this.cache.get(stroke));
    }
    ctx.globalAlpha = 1;
    if (this.activeStroke) { ctx.fillStyle = this.activeStroke.color; ctx.fill(this.cache.preview(this.activeStroke)); }
    this.syncGraphInteraction();
    ctx.globalAlpha = alpha;
    if (alpha > 0.01) { this.overlay.draw(ctx, this.camera.zoom, now); this.math.draw(ctx, this.camera.zoom, this.camera.viewport(this.width, this.height)); }
    ctx.globalAlpha = 1; this.semantic.draw(ctx, this.camera, this.width, this.height);
    ctx.restore();
    if (!this.store.strokes.size && !this.activeStroke) this.welcome();
    if (this.cursor?.tool === 'eraser') {
      ctx.fillStyle = '#ffffff90'; ctx.strokeStyle = '#65715a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    this.pendingMetrics = { visible: visible.length, total: this.store.strokes.size, paintMs: performance.now() - start };
    if (now - this.lastMetrics > 200) this.publishMetrics();
    else if (!this.metricsTimer) this.metricsTimer = window.setTimeout(this.publishMetrics, 200);
    if (this.overlay.animating && alpha > 0.01) this.invalidate();
  };
  private publishMetrics = () => {
    window.clearTimeout(this.metricsTimer); this.metricsTimer = 0; this.lastMetrics = performance.now();
    if (this.pendingMetrics) { this.onMetrics(this.pendingMetrics); this.pendingMetrics = null; }
  };
  async exportPng(): Promise<Blob> {
    const box = this.contentBounds();
    if (!box) throw new Error('Draw something before exporting.');
    const padding = 48, width = box.maxX - box.minX + padding * 2, height = box.maxY - box.minY + padding * 2;
    const scale = Math.min(2, 4096 / Math.max(width, height));
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.ceil(width * scale)); output.height = Math.max(1, Math.ceil(height * scale));
    const ctx = output.getContext('2d')!;
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.scale(scale, scale); ctx.translate(padding - box.minX, padding - box.minY);
    for (const stroke of [...this.store.strokes.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      ctx.fillStyle = stroke.color; ctx.fill(this.cache.get(stroke));
    }
    this.overlay.draw(ctx, scale, performance.now());
    this.math.draw(ctx, scale);
    return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not export the drawing.')), 'image/png'));
  }
  contentBounds() {
    const ink = this.store.bounds();
    return ink ? union([ink, ...this.math.bounds]) : null;
  }
  dispose() {
    window.clearTimeout(this.metricsTimer);
    cancelAnimationFrame(this.frame); this.observer.disconnect();
    window.removeEventListener('resize', this.resize);
  }
}
