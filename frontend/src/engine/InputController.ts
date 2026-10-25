import type { InkStroke, Point, Tool } from '../types/canvas';
import { strokeBounds } from '../types/canvas';
import { Camera } from './Camera';
import { BoardStore } from './BoardStore';
import { Renderer } from './Renderer';
import type { GraphController } from './GraphController';

type Gesture = { id: number; tool: Tool; last: Point; erased: InkStroke[]; stroke?: InkStroke };
export class InputController {
  tool: Tool = 'pen';
  color = '#303c35';
  size = 5;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private pinch: { distance: number; zoom: number; anchor: Point } | null = null;
  private touchSuppressed = false;
  private space = false;
  private events = new AbortController();

  constructor(private canvas: HTMLCanvasElement, private camera: Camera, private store: BoardStore, private renderer: Renderer,
    private cameraChanged: () => void, private toolChanged: (tool: Tool) => void, private showHelp: () => void, private graph: GraphController) {
    const signal = this.events.signal;
    canvas.addEventListener('pointerdown', this.down, { signal });
    canvas.addEventListener('pointermove', this.move, { signal });
    canvas.addEventListener('pointerup', this.up, { signal });
    canvas.addEventListener('pointercancel', this.cancel, { signal });
    canvas.addEventListener('lostpointercapture', this.cancel, { signal });
    canvas.addEventListener('pointerleave', () => { if (!this.gesture) { renderer.cursor = null; graph.hoverEdgeId = null; renderer.invalidate(); } }, { signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    canvas.addEventListener('wheel', this.wheel, { passive: false, signal });
    window.addEventListener('keydown', this.keydown, { signal });
    window.addEventListener('keyup', this.keyup, { signal });
    window.addEventListener('blur', this.reset, { signal });
  }
  setTool(tool: Tool) {
    this.cancelGesture(); this.tool = tool;
    if (tool !== 'select') this.graph.hoverEdgeId = null;
    if (this.renderer.cursor) this.renderer.cursor.tool = tool;
    this.updateCursor(); this.renderer.invalidate();
  }
  private position(event: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private updateCursor() {
    this.canvas.style.cursor = this.space || this.tool === 'hand' ? (this.gesture ? 'grabbing' : 'grab') : this.tool === 'eraser' ? 'none' : this.tool === 'select' ? 'default' : 'crosshair';
  }
  private point(event: PointerEvent) {
    return { ...this.camera.screenToWorld(this.position(event)), pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 0.5, t: event.timeStamp };
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.pointerType === 'touch' && this.gesture?.stroke && this.gesture.stroke.authorId === 'pen') return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const pos = this.position(event);
    this.pointers.set(event.pointerId, pos);
    this.canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch' && this.pointers.size === 2) {
      this.cancelGesture();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), zoom: this.camera.zoom,
        anchor: this.camera.screenToWorld({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
      this.touchSuppressed = true;
      return;
    }
    if (this.gesture || this.touchSuppressed) return;
    const tool = this.space || event.button === 1 ? 'hand' : event.pointerType === 'pen' && (event.buttons & 32) ? 'eraser' : this.tool;
    const gesture: Gesture = { id: event.pointerId, tool, last: pos, erased: [] };
    this.gesture = gesture;
    if (tool === 'pen') {
      const points = [this.point(event)];
      gesture.stroke = { id: crypto.randomUUID(), authorId: event.pointerType === 'pen' ? 'pen' : 'local', version: 1, createdAt: Date.now() + performance.now() % 1,
        points, bbox: strokeBounds(points, this.size), color: this.color, size: this.size, semanticRole: 'raw' };
      this.renderer.activeStroke = gesture.stroke;
    } else if (tool === 'eraser') {
      const world = this.camera.screenToWorld(pos);
      gesture.erased.push(...this.store.eraseBetween(world, world, 14 / this.camera.zoom));
    } else if (tool === 'select') {
      this.graph.pointerDown(pos, this.camera.screenToWorld(pos), this.camera.zoom, event.shiftKey);
    }
    this.updateCursor(); this.renderer.invalidate();
  };
  private move = (event: PointerEvent) => {
    const pos = this.position(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, pos);
    this.renderer.cursor = { ...pos, tool: this.gesture?.tool ?? this.tool };
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()], pinch = this.pinch;
      this.camera.zoom = Math.max(0.05, Math.min(5, pinch.zoom * Math.hypot(b.x - a.x, b.y - a.y) / pinch.distance));
      this.camera.x = (a.x + b.x) / 2 - pinch.anchor.x * this.camera.zoom;
      this.camera.y = (a.y + b.y) / 2 - pinch.anchor.y * this.camera.zoom;
      this.cameraChanged(); this.renderer.invalidate(); return;
    }
    const gesture = this.gesture;
    if (gesture?.id === event.pointerId) {
      if (gesture.tool === 'hand') {
        this.camera.x += pos.x - gesture.last.x; this.camera.y += pos.y - gesture.last.y; this.cameraChanged();
      } else if (gesture.stroke) {
        const events = event.getCoalescedEvents?.() ?? [];
        for (const sample of events.length ? events : [event]) {
          const point = this.point(sample), previous = gesture.stroke.points.at(-1)!;
          if (Math.hypot(point.x - previous.x, point.y - previous.y) * this.camera.zoom >= 0.5) gesture.stroke.points.push(point);
        }
      } else if (gesture.tool === 'eraser') {
        gesture.erased.push(...this.store.eraseBetween(this.camera.screenToWorld(gesture.last), this.camera.screenToWorld(pos), 14 / this.camera.zoom));
      } else if (gesture.tool === 'select') {
        this.graph.pointerMove(pos);
      }
      gesture.last = pos;
    }
    if (this.tool === 'select') this.canvas.style.cursor = this.graph.hover(this.camera.screenToWorld(pos), this.camera.zoom) ? 'ns-resize' : 'default';
    if (gesture || this.tool === 'eraser') this.renderer.invalidate();
  };
  private up = (event: PointerEvent) => {
    if (this.gesture?.id === event.pointerId) {
      this.move(event);
      const gesture = this.gesture;
      this.gesture = null;
      if (gesture.stroke) {
        gesture.stroke.bbox = strokeBounds(gesture.stroke.points, gesture.stroke.size);
        this.store.add([gesture.stroke]);
      } else if (gesture.tool === 'eraser') this.store.finishErase(gesture.erased);
      else if (gesture.tool === 'select') this.graph.pointerUp();
      this.renderer.activeStroke = null;
    }
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.touchSuppressed = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.updateCursor(); this.renderer.invalidate();
  };
  private cancel = (event: PointerEvent) => {
    if (this.gesture?.id === event.pointerId) this.cancelGesture();
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.touchSuppressed = false;
  };
  private cancelGesture() {
    if (this.gesture?.tool === 'select') this.graph.pointerUp(true);
    if (this.gesture?.erased.length) this.store.cancelErase(this.gesture.erased);
    this.gesture = null; this.renderer.activeStroke = null;
    this.updateCursor(); this.renderer.invalidate();
  }
  private reset = () => { this.cancelGesture(); this.space = false; this.pointers.clear(); this.pinch = null; this.touchSuppressed = false; this.updateCursor(); };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    if (this.gesture || this.pinch) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.renderer.height : 1;
    if (event.ctrlKey || event.metaKey) this.camera.zoomAt(this.position(event), this.camera.zoom * Math.exp(-event.deltaY * unit * 0.008));
    else if (event.shiftKey && !event.deltaX) this.camera.x -= event.deltaY * unit;
    else { this.camera.x -= event.deltaX * unit; this.camera.y -= event.deltaY * unit; }
    this.cameraChanged(); this.renderer.invalidate();
  };
  private keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    if (event.code === 'Space' && target.closest('button, a')?.matches(':focus-visible')) return;
    const key = event.key.toLowerCase(), mod = event.metaKey || event.ctrlKey;
    if (event.code === 'Space') { event.preventDefault(); this.space = true; this.updateCursor(); return; }
    if (key === 'escape') { this.reset(); return; }
    if (mod && (key === 'z' || key === 'y')) {
      event.preventDefault(); this.cancelGesture();
      if (key === 'y' || event.shiftKey) this.store.redo(); else this.store.undo();
    } else if (!mod && !event.altKey) {
      if (key === 'p' || key === 'e' || key === 'h' || key === 'v') {
        const tool = key === 'p' ? 'pen' : key === 'e' ? 'eraser' : key === 'v' ? 'select' : 'hand';
        this.setTool(tool); this.toolChanged(tool);
      } else if (key === '+' || key === '=') { event.preventDefault(); this.zoom(1.25); }
      else if (key === '-') { event.preventDefault(); this.zoom(0.8); }
      else if (key === '0') { event.preventDefault(); this.fit(); }
      else if (key === '1') { event.preventDefault(); this.camera.zoomAt(this.center(), 1); this.cameraChanged(); this.renderer.invalidate(); }
      else if (key === '?') { event.preventDefault(); this.showHelp(); }
    }
  };
  private keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { this.space = false; this.updateCursor(); } };
  private center() { return { x: this.renderer.width / 2, y: this.renderer.height / 2 }; }
  zoom(factor: number) { this.camera.zoomAt(this.center(), this.camera.zoom * factor); this.cameraChanged(); this.renderer.invalidate(); }
  fit() {
    const bounds = this.store.bounds();
    const hasGraph = this.renderer.overlay.visible;
    const width = this.renderer.width - (hasGraph && this.renderer.width >= 1000 ? 350 : 0);
    const height = this.renderer.height - (hasGraph && this.renderer.width < 1000 ? 260 : 0);
    if (bounds) this.camera.fit(bounds, width, height);
    else this.camera.restore({ x: 0, y: 0, zoom: 1 });
    this.cameraChanged(); this.renderer.invalidate();
  }
  dispose() { this.reset(); this.events.abort(); }
}
