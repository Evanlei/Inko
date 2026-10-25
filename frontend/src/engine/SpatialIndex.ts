import RBush from 'rbush';
import type { BBox, InkStroke } from '../types/canvas';

interface StrokeEntry extends BBox { id: string }
export class SpatialIndex {
  private tree = new RBush<StrokeEntry>();
  private entries = new Map<string, StrokeEntry>();
  clear() { this.tree.clear(); this.entries.clear(); }
  insert(stroke: InkStroke) {
    this.remove(stroke.id);
    const entry = { ...stroke.bbox, id: stroke.id };
    this.entries.set(stroke.id, entry);
    this.tree.insert(entry);
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (entry) { this.tree.remove(entry); this.entries.delete(id); }
  }
  search(box: BBox) { return this.tree.search(box).map((entry) => entry.id); }
}
