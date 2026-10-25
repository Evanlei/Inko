import RBush from 'rbush';
import type { BBox, InkStroke } from '../types/canvas';

type Entry = BBox & { id: string };
export interface InkCluster { id: string; strokeIds: string[]; bbox: BBox }
export function bboxDistance(a: BBox, b: BBox) {
  return Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY));
}

/** Incremental R-tree and neighborhood cache; DBSCAN labels are rebuilt so deletions can split clusters. */
export class InkClustering {
  private tree = new RBush<Entry>();
  private entries = new Map<string, Entry>();
  private neighbors = new Map<string, string[]>();
  constructor(private epsilon = 110, private minPoints = 2) {}
  private expanded(box: BBox): BBox {
    return { minX: box.minX - this.epsilon, minY: box.minY - this.epsilon, maxX: box.maxX + this.epsilon, maxY: box.maxY + this.epsilon };
  }
  private invalidate(box: BBox) {
    for (const entry of this.tree.search(this.expanded(box))) this.neighbors.delete(entry.id);
  }
  update(added: InkStroke[], removedIds: string[]): InkCluster[] {
    for (const id of new Set([...removedIds, ...added.map((s) => s.id)])) {
      const old = this.entries.get(id);
      if (old) { this.invalidate(old); this.tree.remove(old); this.entries.delete(id); this.neighbors.delete(id); }
    }
    for (const stroke of added) {
      const entry = { ...stroke.bbox, id: stroke.id };
      this.invalidate(entry); this.tree.insert(entry); this.entries.set(entry.id, entry);
    }
    return this.cluster();
  }
  private region(id: string) {
    let cached = this.neighbors.get(id);
    if (!cached) {
      const box = this.entries.get(id)!;
      cached = this.tree.search(this.expanded(box)).filter((e) => bboxDistance(box, e) <= this.epsilon).map((e) => e.id).sort();
      this.neighbors.set(id, cached);
    }
    return cached;
  }
  private cluster(): InkCluster[] {
    const visited = new Set<string>(), assigned = new Set<string>(), result: InkCluster[] = [];
    for (const id of [...this.entries.keys()].sort()) {
      if (visited.has(id)) continue;
      visited.add(id);
      const neighbors = this.region(id);
      if (neighbors.length < this.minPoints) continue;
      const queue = [...neighbors], queued = new Set(queue), members: string[] = [];
      for (let i = 0; i < queue.length; i++) {
        const next = queue[i];
        if (!visited.has(next)) {
          visited.add(next);
          const nearby = this.region(next);
          if (nearby.length >= this.minPoints) for (const n of nearby) if (!queued.has(n)) { queued.add(n); queue.push(n); }
        }
        if (!assigned.has(next)) { assigned.add(next); members.push(next); }
      }
      members.sort();
      const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const member of members) {
        const box = this.entries.get(member)!;
        bbox.minX = Math.min(bbox.minX, box.minX - 32); bbox.minY = Math.min(bbox.minY, box.minY - 32);
        bbox.maxX = Math.max(bbox.maxX, box.maxX + 32); bbox.maxY = Math.max(bbox.maxY, box.maxY + 32);
      }
      result.push({ id: `cluster:${members[0]}`, strokeIds: members, bbox });
    }
    return result;
  }
}
