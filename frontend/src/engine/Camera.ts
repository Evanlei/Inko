import type { BBox, CameraState, Point } from '../types/canvas';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  screenToWorld(point: Point): Point {
    return { x: (point.x - this.x) / this.zoom, y: (point.y - this.y) / this.zoom };
  }
  worldToScreen(point: Point): Point {
    return { x: point.x * this.zoom + this.x, y: point.y * this.zoom + this.y };
  }
  zoomAt(point: Point, nextZoom: number) {
    const world = this.screenToWorld(point);
    this.zoom = Math.max(0.05, Math.min(5, nextZoom));
    this.x = point.x - world.x * this.zoom;
    this.y = point.y - world.y * this.zoom;
  }
  viewport(width: number, height: number): BBox {
    const start = this.screenToWorld({ x: 0, y: 0 });
    const end = this.screenToWorld({ x: width, y: height });
    return { minX: start.x, minY: start.y, maxX: end.x, maxY: end.y };
  }
  fit(box: BBox, width: number, height: number) {
    const margin = width < 600 ? 70 : width < 1000 ? 100 : 150;
    this.zoom = Math.max(0.05, Math.min(2, (width - margin * 2) / Math.max(1, box.maxX - box.minX), (height - 240) / Math.max(1, box.maxY - box.minY)));
    this.x = width / 2 - (box.minX + box.maxX) / 2 * this.zoom;
    this.y = height / 2 - (box.minY + box.maxY) / 2 * this.zoom;
  }
  restore(state: CameraState) { this.x = state.x; this.y = state.y; this.zoom = state.zoom; }
  serialize(): CameraState { return { x: this.x, y: this.y, zoom: this.zoom }; }
}
