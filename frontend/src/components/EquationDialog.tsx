import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';

export function EquationDialog({ dialogRef, onAdd }: { dialogRef: RefObject<HTMLDialogElement | null>; onAdd: (expression: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState('');
  return <dialog ref={dialogRef} className="help-dialog equation-dialog" aria-labelledby="equation-title" onClose={() => { setError(''); if (input.current) input.current.value = ''; }}>
    <button className="icon-button close-help" aria-label="Close equation editor" onClick={() => dialogRef.current?.close()}><X size={18} /></button>
    <h2 id="equation-title">A little live math.</h2>
    <p>Enter an equation. It becomes ink you can edit and erase.</p>
    <form className="equation-form" onSubmit={(event) => {
      event.preventDefault();
      try { onAdd(input.current!.value); dialogRef.current?.close(); }
      catch (reason) { setError((reason as Error).message); }
    }}><label>Equation<input ref={input} autoFocus required aria-label="New equation" placeholder="k = 4" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={160} /></label>
      <button type="submit">Add to canvas</button>
      {error ? <p className="math-error" role="alert">{error}</p> : null}
    </form>
    <p>Use lowercase names, + − * / ^, parentheses, sin, cos, tan, exp, sqrt, log, abs, min, and max. Define variables above the equations that use them. Functions use x: y(x) = sin(k*x).</p>
  </dialog>;
}
