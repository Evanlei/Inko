import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { GraphController } from '../engine/GraphController';
import type { GraphEdge, GraphSnapshot } from '../types/graph';

function WeightEditor({ edge, controller }: { edge: GraphEdge; controller: GraphController }) {
  const [draft, setDraft] = useState(String(edge.weight)), [error, setError] = useState('');
  return <form className="weight-editor" onSubmit={(event) => {
    event.preventDefault();
    if (!draft.trim() || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > 1e6) {
      setError('Use a number from 0 to 1,000,000.'); return;
    }
    controller.setWeight(edge.id, Number(draft)); setError('');
  }}>
    <label>Weight<input aria-label="Connection weight" inputMode="decimal" type="number" min="0" max="1000000" step="any" value={draft}
      aria-invalid={!!error} onChange={(event) => { setDraft(event.target.value); setError(''); }} /></label>
    <button className="weight-apply" type="submit" aria-label="Apply weight"><Check size={15} />Apply</button>
    {error ? <p className="weight-error" role="alert">{error}</p> : null}
  </form>;
}
export function GraphControlBar({ snapshot, controller }: { snapshot: GraphSnapshot; controller: GraphController }) {
  const [collapsed, setCollapsed] = useState(false);
  const { graph, algorithm, stepIndex, playing, processing, selectedEdgeId, error } = snapshot;
  if (error) return <aside className="graph-controls panel graph-error" aria-label="Graph controls"><p>{error}</p><button onClick={controller.retry}>Retry recognition</button></aside>;
  if (!graph) return null;
  const trace = graph.steps[algorithm], step = trace[stepIndex], last = trace.length - 1;
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId);
  const vertexLabel = (id: string) => graph.vertices.find((v) => v.id === id)?.label ?? '?';
  const cost = step?.distances[graph.targetVertexId];
  const result = stepIndex === last, value = stepIndex === 0 ? '—' : cost === 'INF' ? '∞' : cost;
  const metric = algorithm === 'dijkstra' ? result ? 'Shortest route' : 'Tentative cost' : algorithm === 'bfs' ? 'Fewest hops' : 'Traversal depth';
  return <aside className="graph-controls panel" aria-label="Graph controls" aria-busy={processing}>
    <div className="graph-heading"><span>Network</span><span className={`graph-ready ${processing ? 'busy' : ''}`}>{processing ? 'Reading ink…' : 'Live ink'}</span>
      <button aria-label={collapsed ? 'Expand graph controls' : 'Minimize graph controls'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
    {!collapsed ? <>
    <p className="graph-count">{graph.vertices.length} nodes · {graph.edges.length} connection{graph.edges.length === 1 ? '' : 's'}</p>
    <div className="algorithm-options" role="group" aria-label="Graph algorithm">
      {(['dijkstra', 'bfs', 'dfs'] as const).map((name) => <button key={name} aria-pressed={algorithm === name} disabled={processing}
        onClick={() => controller.selectAlgorithm(name)}>{name === 'dijkstra' ? 'Dijkstra' : name.toUpperCase()}</button>)}
    </div>
    <div className="graph-summary"><div><span>{metric}</span><strong aria-label="Route value">{value}</strong></div><div className="endpoint-selects">
      <label>From<select aria-label="Start node" value={graph.startVertexId} disabled={processing} onChange={(e) => controller.setEndpoint('startVertexId', e.target.value)}>
        {graph.vertices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select></label><ArrowRight size={14} />
      <label>To<select aria-label="End node" value={graph.targetVertexId} disabled={processing} onChange={(e) => controller.setEndpoint('targetVertexId', e.target.value)}>
        {graph.vertices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select></label>
    </div></div>
    <div className="transport">
      <button aria-label="Restart algorithm" disabled={processing} onClick={() => controller.step(0)}><RotateCcw size={15} /></button>
      <button aria-label="Previous step" disabled={processing || stepIndex === 0} onClick={() => controller.step(stepIndex - 1)}><SkipBack size={15} /></button>
      <button className="play-button" aria-label={playing ? 'Pause algorithm' : 'Play algorithm'} disabled={processing} onClick={() => controller.togglePlayback()}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <button aria-label="Next step" disabled={processing || result} onClick={() => controller.step(stepIndex + 1)}><SkipForward size={15} /></button>
      <button className="show-result" disabled={processing} onClick={() => controller.step(last)}>Result<ArrowRight size={13} /></button>
    </div>
    <label className="graph-progress"><input type="range" aria-label="Algorithm step" min="0" max={last} value={stepIndex} disabled={processing}
      onChange={(event) => controller.step(Number(event.target.value))} /><span>{stepIndex + 1}<span> / {trace.length}</span></span></label>
    <p className="step-description" aria-live="polite">{step?.description}</p>
    <div className="connection-picker"><label htmlFor="connection">Connection</label><select id="connection" aria-label="Edit connection" disabled={processing}
      value={selectedEdgeId ?? ''} onChange={(e) => controller.selectEdge(e.target.value || null)}><option value="">Choose a weight…</option>
      {graph.edges.slice().sort((a, b) => vertexLabel(a.sourceVertexId).localeCompare(vertexLabel(b.sourceVertexId)) || vertexLabel(a.targetVertexId).localeCompare(vertexLabel(b.targetVertexId)))
        .map((e) => <option key={e.id} value={e.id}>{vertexLabel(e.sourceVertexId)} {e.directed ? '→' : '↔'} {vertexLabel(e.targetVertexId)} · {e.weight}</option>)}
    </select></div>
    {selectedEdge && !processing ? <WeightEditor key={`${selectedEdge.id}:${selectedEdge.weight}`} edge={selectedEdge} controller={controller} /> : null}
    <p className="graph-hint">Drag a weight with Select <kbd>V</kbd>.</p>
    </> : null}
  </aside>;
}
