import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { GraphController } from '../engine/GraphController';
import type { MathASTNode } from '../types/math';
import { formatMath } from '../types/math';
import type { GraphSnapshot } from '../types/graph';

function EquationEditor({ node, controller, disabled }: { node: MathASTNode; controller: GraphController; disabled: boolean }) {
  const [draft, setDraft] = useState(node.rawExpression), [value, setValue] = useState(String(node.scrubTarget?.value ?? ''));
  const [error, setError] = useState('');
  return <>
    {node.scrubTarget ? <form className="math-value-form" onSubmit={(event) => {
      event.preventDefault();
      try { if (!value.trim()) throw new Error('Enter a value.'); controller.setMathValue(node.id, Number(value)); setError(''); }
      catch (reason) { setError((reason as Error).message); }
    }}><label>Variable value<input aria-label="Variable value" type="number" step="any" min="-1000000" max="1000000" value={value} disabled={disabled}
      onChange={(event) => setValue(event.target.value)} /></label><button disabled={disabled} type="submit">Apply value</button></form> : null}
    <form className="equation-form" onSubmit={(event) => {
      event.preventDefault(); try { controller.editEquation(node.id, draft); setError(''); } catch (reason) { setError((reason as Error).message); }
    }}><label>Equation<input aria-label="Edit equation" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={160} value={draft} disabled={disabled}
      onChange={(event) => setDraft(event.target.value)} /></label><button disabled={disabled} type="submit">Update equation</button></form>
    {error ? <p className="math-error" role="alert">{error}</p> : null}
  </>;
}
export function MathControlBar({ snapshot, controller, overview, onAdd }: { snapshot: GraphSnapshot; controller: GraphController; overview: boolean; onAdd: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [preference, setPreference] = useState<{ overview: boolean; collapsed: boolean } | null>(null);
  const collapsed = preference?.overview === overview ? preference.collapsed : overview;
  if (!snapshot.math.length) return null;
  const node = snapshot.math.find((n) => n.id === selected) ?? snapshot.math[0];
  return <aside className="graph-controls panel math-controls" aria-label="Math controls" aria-busy={snapshot.processing}>
    <div className="graph-heading"><span>Live math</span><span className="graph-ready">{snapshot.processing ? 'Updating…' : 'Live ink'}</span>
      <button aria-label={collapsed ? 'Expand math controls' : 'Minimize math controls'} aria-expanded={!collapsed}
        onClick={() => setPreference({ overview, collapsed: !collapsed })}>{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
    {!collapsed ? <>
      <p className="math-caption">Definitions flow from top to bottom.</p>
      <div className="math-equations" role="group" aria-label="Equations">{snapshot.math.map((n, index) => <button key={n.id} aria-label={`Select equation ${index + 1}: ${n.rawExpression}`}
        aria-pressed={node.id === n.id} disabled={snapshot.processing} onClick={() => setSelected(n.id)}><span>{n.rawExpression}</span>
        <output aria-label={`${n.variableName ?? `Equation ${index + 1}`} result`}>{n.error ? 'Error' : n.plot ? '200 samples' : formatMath(n.numericValue!)}</output></button>)}</div>
      {node.error ? <p className="math-error" role="status">{node.error}</p> : null}
      <EquationEditor key={`${node.id}:${node.rawExpression}`} node={node} controller={controller} disabled={snapshot.processing} />
      <button className="math-add" onClick={onAdd}>Add equation</button>
      <p className="graph-hint">Select <kbd>V</kbd> and drag a literal vertically to explore.</p>
    </> : null}
  </aside>;
}
