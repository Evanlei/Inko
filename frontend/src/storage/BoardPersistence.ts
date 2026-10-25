import type { BoardChange, BoardMeta, InkStroke } from '../types/canvas';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';
const DATABASE = 'inko-local';
const BOARD = 'workspace';

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function isStroke(value: unknown): value is InkStroke {
  if (!value || typeof value !== 'object') return false;
  const s = value as InkStroke;
  return typeof s.id === 'string' && Number.isFinite(s.createdAt) && Number.isFinite(s.version)
    && typeof s.color === 'string' && Number.isFinite(s.size) && s.size > 0
    && s.bbox != null && Object.values(s.bbox).every(Number.isFinite)
    && Array.isArray(s.points) && s.points.length > 0
    && s.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.pressure) && Number.isFinite(p.t));
}
function isMeta(value: unknown): value is BoardMeta {
  if (!value || typeof value !== 'object') return false;
  const m = value as BoardMeta;
  return typeof m.title === 'string' && m.camera != null && Number.isFinite(m.camera.x)
    && Number.isFinite(m.camera.y) && m.camera.zoom >= 0.05 && m.camera.zoom <= 5;
}

export class BoardPersistence {
  private revision = 0;
  private failed = false;
  private constructor(private db: IDBDatabase, private status: (status: SaveStatus) => void) {}
  static async open(status: (status: SaveStatus) => void) {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore('strokes', { keyPath: 'id' });
      opening.result.createObjectStore('meta');
    };
    const db = await request(opening);
    db.onversionchange = () => { db.close(); status('error'); };
    return new BoardPersistence(db, status);
  }
  async load(): Promise<{ strokes: InkStroke[]; meta: BoardMeta | null }> {
    const tx = this.db.transaction(['strokes', 'meta'], 'readonly');
    const [strokes, meta] = await Promise.all([
      request<unknown[]>(tx.objectStore('strokes').getAll()),
      request<unknown>(tx.objectStore('meta').get(BOARD)),
    ]);
    if (!strokes.every(isStroke) || (meta != null && !isMeta(meta))) throw new Error('Stored workspace is invalid');
    return { strokes: strokes as InkStroke[], meta: isMeta(meta) ? meta : null };
  }
  save(change: BoardChange, meta: BoardMeta) {
    const revision = ++this.revision;
    this.status(this.failed ? 'error' : 'saving');
    try {
      const tx = this.db.transaction(['strokes', 'meta'], 'readwrite');
      const strokes = tx.objectStore('strokes');
      change.removed.forEach((stroke) => strokes.delete(stroke.id));
      change.added.forEach((stroke) => strokes.put(stroke));
      tx.objectStore('meta').put(meta, BOARD);
      tx.oncomplete = () => { if (revision === this.revision && !this.failed) this.status('saved'); };
      tx.onabort = () => { this.failed = true; this.status('error'); };
      tx.onerror = () => { this.failed = true; this.status('error'); };
    } catch {
      this.failed = true;
      this.status('error');
    }
  }
  close() { this.db.close(); }
}
