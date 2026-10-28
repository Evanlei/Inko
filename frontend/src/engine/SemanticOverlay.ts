import RBush from 'rbush';
import type { BBox, Point } from '../types/canvas';
import type { SemanticCluster } from '../types/semantic';
import { inkOpacity } from '../types/semantic';
import type { Camera } from './Camera';

type Entry = BBox & { cluster: SemanticCluster };
export class SemanticOverlay {
  private tree = new RBush<Entry>();
  private clusters: SemanticCluster[] = [];
  readonly members = new Set<string>();
  set(clusters: SemanticCluster[]) {
    if (clusters === this.clusters) return;
    this.clusters = clusters; this.members.clear(); this.tree.clear();
    this.tree.load(clusters.map((cluster) => ({ ...cluster.bbox, cluster })));
    for (const cluster of clusters) for (const id of cluster.strokeIds) this.members.add(id);
  }
  private rect(cluster: SemanticCluster, zoom: number) {
    const b = cluster.bbox, width = Math.max(196 / zoom, b.maxX - b.minX), height = Math.max(116 / zoom, b.maxY - b.minY);
    return { x: (b.minX + b.maxX - width) / 2, y: (b.minY + b.maxY - height) / 2, width, height };
  }
  hit(point: Point, zoom: number) {
    if (zoom > 0.28) return null;
    const pad = 200 / zoom;
    for (const { cluster } of this.tree.search({ minX: point.x - pad, minY: point.y - pad, maxX: point.x + pad, maxY: point.y + pad })) {
      const r = this.rect(cluster, zoom);
      if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) return cluster.bbox;
    }
    return null;
  }
  draw(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number) {
    const alpha = 1 - inkOpacity(camera.zoom);
    if (alpha <= 0.01) return;
    const zoom = camera.zoom, view = camera.viewport(width, height), pad = 200 / zoom;
    const visible = this.tree.search({ minX: view.minX - pad, minY: view.minY - pad, maxX: view.maxX + pad, maxY: view.maxY + pad });
    ctx.save(); ctx.globalAlpha = alpha;
    for (const { cluster } of visible) {
      const r = this.rect(cluster, zoom), inset = 18 / zoom;
      ctx.fillStyle = '#f8fafbf5'; ctx.strokeStyle = '#c8d3da'; ctx.lineWidth = 1 / zoom;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, 13 / zoom); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#758995';
      ctx.font = `400 ${11 / zoom}px system-ui, sans-serif`;
      ctx.fillText(cluster.title, r.x + inset, r.y + inset, r.width - inset * 2);
      ctx.fillStyle = '#495963'; ctx.font = `400 ${17 / zoom}px system-ui, sans-serif`;
      ctx.fillText(cluster.primaryMetric, r.x + inset, r.y + 41 / zoom, r.width - inset * 2);
      ctx.fillStyle = '#7a8891'; ctx.font = `400 ${10 / zoom}px system-ui, sans-serif`;
      ctx.fillText(cluster.secondaryBadge, r.x + inset, r.y + 68 / zoom, r.width - inset * 2);
      const preview = cluster.preview;
      if (preview) {
        const side = r.width * zoom >= 380;
        const w = side ? Math.min(100 / zoom, r.width * 0.27) : Math.min(140 / zoom, r.width - inset * 2);
        const h = side ? Math.max(26 / zoom, r.height - 32 / zoom) : Math.max(16 / zoom, r.height - 100 / zoom);
        const x = side ? r.x + r.width - w - inset : r.x + inset, y = side ? r.y + inset : r.y + 88 / zoom;
        const points = preview.vertices.map(([px, py]) => ({ x: x + px * w, y: y + py * h }));
        ctx.strokeStyle = '#b2c2cb'; ctx.lineWidth = 1 / zoom; ctx.beginPath();
        for (const [a, b] of preview.edges) { ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); }
        ctx.stroke(); ctx.fillStyle = '#7c9da8'; ctx.beginPath();
        for (const point of points) { ctx.moveTo(point.x + 2.5 / zoom, point.y); ctx.arc(point.x, point.y, 2.5 / zoom, 0, Math.PI * 2); }
        ctx.fill();
      }
      if (cluster.sparkline) {
        const w = Math.min(180 / zoom, r.width - inset * 2), h = Math.max(16 / zoom, r.height - 100 / zoom);
        ctx.strokeStyle = '#7c9da8'; ctx.lineWidth = 1.5 / zoom; ctx.beginPath();
        let previous: number | null = null;
        for (const [x, y] of cluster.sparkline) {
          if (y === null) { previous = null; continue; }
          const px = r.x + inset + x * w, py = r.y + 88 / zoom + (1 - y) * h;
          if (previous === null || Math.abs(y - previous) > 0.5) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          previous = y;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
