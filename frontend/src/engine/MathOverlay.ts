import type { BBox } from '../types/canvas';
import type { MathASTNode, MathOverride } from '../types/math';
import { formatMath } from '../types/math';

export class MathOverlay {
  private nodes: MathASTNode[] = [];
  private paths = new Map<string, Path2D>();
  hoveredId: string | null = null;
  preview: MathOverride | null = null;
  get visible() { return this.nodes.length > 0; }
  get bounds(): BBox[] { return this.nodes.map((n) => n.displayBBox); }
  set(nodes: MathASTNode[]) {
    if (this.nodes === nodes) return;
    this.nodes = nodes; this.paths.clear();
    for (const node of nodes) {
      if (!node.plot) continue;
      const { bbox: b, samples, range } = node.plot, path = new Path2D();
      let previous: number | null = null;
      for (const [x, y] of samples) {
        if (y === null) { previous = null; continue; }
        const px = b.minX + x / 10 * (b.maxX - b.minX), py = (b.minY + b.maxY) / 2 - y / range[1] / 2 * (b.maxY - b.minY);
        if (previous === null || Math.abs(y / range[1] - previous / range[1]) > 1) path.moveTo(px, py); else path.lineTo(px, py);
        previous = y;
      }
      this.paths.set(node.id, path);
    }
  }
  draw(ctx: CanvasRenderingContext2D, zoom: number, viewport?: BBox) {
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const node of this.nodes) {
      const b = node.displayBBox;
      if (viewport && (b.maxX < viewport.minX || b.minX > viewport.maxX || b.maxY < viewport.minY || b.minY > viewport.maxY)) continue;
      const x = node.bbox.maxX + 18, y = (node.bbox.minY + node.bbox.maxY) / 2;
      ctx.font = `400 ${12 / zoom}px system-ui, sans-serif`;
      if (node.error) {
        ctx.fillStyle = '#a77057'; ctx.fillText('Equation error', x, y, 120 / zoom);
      } else if (!node.scrubTarget && node.numericValue !== undefined) {
        ctx.fillStyle = '#6e9299'; ctx.fillText(`= ${formatMath(node.numericValue)}`, x, y);
      }
      const target = node.scrubTarget;
      if (target && (this.hoveredId === node.id || this.preview?.nodeId === node.id)) {
        const text = `↕ ${formatMath(this.preview?.nodeId === node.id ? this.preview.value : target.value)}`;
        const width = ctx.measureText(text).width + 16 / zoom;
        ctx.fillStyle = '#edf3f6'; ctx.beginPath(); ctx.roundRect(x, y - 13 / zoom, width, 26 / zoom, 7 / zoom); ctx.fill();
        ctx.fillStyle = '#638491'; ctx.fillText(text, x + 8 / zoom, y);
      }
      if (!node.plot) continue;
      const { bbox: p, range } = node.plot, middle = (p.minY + p.maxY) / 2;
      ctx.strokeStyle = '#d3dee4'; ctx.lineWidth = 1 / zoom; ctx.beginPath();
      ctx.moveTo(p.minX, p.minY); ctx.lineTo(p.minX, p.maxY); ctx.moveTo(p.minX, middle); ctx.lineTo(p.maxX, middle); ctx.stroke();
      ctx.fillStyle = '#8398a2'; ctx.font = `400 ${10 / zoom}px system-ui, sans-serif`;
      ctx.fillText('0', p.minX, p.maxY + 16 / zoom); ctx.fillText('10', p.maxX - 10 / zoom, p.maxY + 16 / zoom);
      ctx.fillText(formatMath(range[1]), p.minX - 35 / zoom, p.minY); ctx.fillText(formatMath(range[0]), p.minX - 35 / zoom, p.maxY);
      ctx.strokeStyle = '#6d9d9e'; ctx.lineWidth = 2 / zoom; ctx.lineJoin = 'round';
      const path = this.paths.get(node.id); if (path) ctx.stroke(path);
    }
    ctx.restore();
  }
}
