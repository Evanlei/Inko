import { useRef } from 'react';
import { ArrowUpRight, Network, PenLine, Sparkles } from 'lucide-react';

export function ExamplesMenu({ disabled, onGraph, onSketch }: { disabled: boolean; onGraph: () => void; onSketch: () => void }) {
  const popover = useRef<HTMLDivElement>(null);
  function choose(action: () => void) { popover.current?.hidePopover(); action(); }
  return <>
    <button className="examples-trigger" aria-label="Examples" popoverTarget="example-workspaces" disabled={disabled}><Sparkles size={15} strokeWidth={1.4} /><span>Examples</span></button>
    <div id="example-workspaces" popover="auto" ref={popover} className="examples-menu panel" aria-label="Example workspaces">
      <span className="examples-caption">A fresh canvas. Undo to go back.</span>
      <button onClick={() => choose(onGraph)}><Network size={19} strokeWidth={1.3} /><span>Routing graph<small>Seven nodes. A few ways through.</small></span><ArrowUpRight size={15} /></button>
      <button onClick={() => choose(onSketch)}><PenLine size={19} strokeWidth={1.3} /><span>Try a sketch<small>A little freehand inspiration.</small></span><ArrowUpRight size={15} /></button>
    </div>
  </>;
}
