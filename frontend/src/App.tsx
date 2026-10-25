import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownToLine, Check, CircleHelp, LoaderCircle, Maximize, Minus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { BoardSession } from './engine/BoardSession';
import type { Metrics } from './engine/Renderer';
import type { SaveStatus } from './storage/BoardPersistence';
import { COLORS } from './types/canvas';
import type { BoardSnapshot, Tool } from './types/canvas';
import { ToolbarHUD } from './components/ToolbarHUD';
import { KeyboardHelp } from './components/KeyboardHelp';
import { GraphControlBar } from './components/GraphControlBar';
import { EMPTY_GRAPH } from './types/graph';
import { ExamplesMenu } from './components/ExamplesMenu';

const empty: BoardSnapshot = { strokeCount: 0, canUndo: false, canRedo: false };
const emptySnapshot = () => empty;
const emptyGraphSnapshot = () => EMPTY_GRAPH;
const emptySubscribe = () => () => {};
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null), help = useRef<HTMLDialogElement>(null);
  const [board, setBoard] = useState<BoardSession | null>(null);
  const [tool, setTool] = useState<Tool>('pen'), [color, setColor] = useState<string>(COLORS[0]), [size, setSize] = useState(5);
  const [title, setTitle] = useState('Untitled space'), [save, setSave] = useState<SaveStatus>('loading');
  const [zoom, setZoom] = useState(1), [error, setError] = useState('');
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, visible: 0, paintMs: 0 });
  const snapshot = useSyncExternalStore(board?.store.subscribe ?? emptySubscribe, board?.store.getSnapshot ?? emptySnapshot);
  const graph = useSyncExternalStore(board?.graph.subscribe ?? emptySubscribe, board?.graph.getSnapshot ?? emptyGraphSnapshot);
  const showHelp = useCallback(() => { if (!help.current?.open) help.current?.showModal(); }, []);
  useEffect(() => {
    let disposed = false, session: BoardSession | null = null;
    const guarded = <T,>(fn: (value: T) => void) => (value: T) => { if (!disposed) fn(value); };
    BoardSession.create(canvas.current!, { save: guarded(setSave), camera: guarded(setZoom), metrics: guarded(setMetrics), tool: guarded(setTool), help: showHelp })
      .then((value) => {
        if (disposed) { value.dispose(); return; }
        session = value; setBoard(value); setTitle(value.title);
      }).catch(() => { if (!disposed) { setError('The canvas could not start. Please reload in a browser with Canvas2D support.'); setSave('error'); } });
    return () => { disposed = true; session?.dispose(); };
  }, [showHelp]);
  function chooseTool(next: Tool) { board?.input.setTool(next); setTool(next); }
  function chooseColor(next: string) { if (board) board.input.color = next; setColor(next); chooseTool('pen'); }
  function chooseSize(next: number) { if (board) board.input.size = next; setSize(next); }
  const saveLabel = save === 'saved' ? 'Saved on this device' : save === 'saving' ? 'Saving…' : save === 'loading' ? 'Opening your space…' : 'Local saving unavailable';

  return <main className="workspace">
    <canvas ref={canvas} className="board select-none" tabIndex={0} aria-label="Infinite drawing canvas. Use the pen to draw, Space and drag to pan, and Ctrl or Command and scroll to zoom." />
    <header className="header">
      <div className="workspace-identity">
        <a className="brand" href="/" aria-label="Inko home"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>inko</span></a>
        <span className="header-divider" />
        <div className="document-name"><input aria-label="Workspace name" maxLength={80} value={title} disabled={!board} spellCheck={false}
          onChange={(e) => { setTitle(e.target.value); board?.rename(e.target.value); }}
          onBlur={() => { if (!title.trim()) { setTitle('Untitled space'); board?.rename('Untitled space'); } }} /></div>
      </div>
      <div className="header-actions">
        <span className={`save-status ${save === 'error' ? 'save-error' : ''}`} role="status" title={save === 'error' ? 'Your browser could not save this workspace. Export your drawing before leaving.' : 'This workspace is stored in this browser on this device.'}>
          {save === 'saved' ? <Check size={14} /> : save === 'error' ? <TriangleAlert size={14} /> : <LoaderCircle size={14} className="spin" />}<span>{saveLabel}</span>
        </span>
        <ExamplesMenu disabled={!board || graph.processing} onSketch={() => { chooseTool('pen'); board?.addSketch(); }} onGraph={() => { chooseTool('select'); board?.addGraphDemo(); }} />
        <button className="export-button" aria-label="Export PNG" title="Export drawing as PNG" disabled={!board || !snapshot.strokeCount} onClick={() => { board?.export().catch((reason: Error) => setError(reason.message)); }}><ArrowDownToLine size={16} strokeWidth={1.4} /></button>
      </div>
    </header>
    <ToolbarHUD tool={tool} color={color} size={size} disabled={!board} canUndo={snapshot.canUndo} canRedo={snapshot.canRedo}
      onTool={chooseTool} onColor={chooseColor} onSize={chooseSize} undo={() => board?.store.undo()} redo={() => board?.store.redo()} />
    {board ? <GraphControlBar snapshot={graph} controller={board.graph} overview={zoom <= 0.18} /> : null}
    <div className="zoom-controls panel" aria-label="Canvas view">
      <button className="icon-button" aria-label="Zoom out" disabled={!board || zoom <= 0.05} onClick={() => board?.input.zoom(0.8)}><Minus size={16} /></button>
      <button className="zoom-value" title="Reset to 100%" aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to 100 percent.`} disabled={!board}
        onClick={() => board?.input.zoom(1 / zoom)}>{Math.round(zoom * 100)}<span>%</span></button>
      <button className="icon-button" aria-label="Zoom in" disabled={!board || zoom >= 5} onClick={() => board?.input.zoom(1.25)}><Plus size={16} /></button>
      <span className="zoom-divider" />
      <button className="icon-button" aria-label="Fit drawing" title="Fit drawing · 0" disabled={!board} onClick={() => board?.input.fit()}><Maximize size={17} /></button>
    </div>
    <footer className="footer">
      <span className="board-status"><span className="status-dot" /><span>{snapshot.strokeCount ? `${snapshot.strokeCount} stroke${snapshot.strokeCount === 1 ? '' : 's'}` : 'Room for anything'}</span><span className="footer-detail">{metrics.visible} visible · {metrics.paintMs.toFixed(1)} ms paint</span>
        {zoom < 0.38 && graph.clusters.length > 0 ? <span role="status" aria-label="Semantic overview">{graph.clusters.length} workspace{graph.clusters.length === 1 ? '' : 's'} · overview</span> : null}</span>
      <span className="navigation-hint"><kbd>space</kbd> to pan<span>·</span><kbd>ctrl / ⌘</kbd> + scroll to zoom</span>
      <div className="footer-actions"><button className="clear-button" disabled={!snapshot.strokeCount} onClick={() => board?.store.clear()} title="Clear drawing (can be undone)"><Trash2 size={14} /><span>Clear</span></button>
        <button className="help-button" onClick={showHelp} aria-label="Keyboard shortcuts"><CircleHelp size={18} /><span>Shortcuts</span></button></div>
    </footer>
    {error ? <div className="error-toast" role="alert"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div> : null}
    <KeyboardHelp dialogRef={help} />
  </main>;
}
