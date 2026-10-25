import { X } from 'lucide-react';
import type { RefObject } from 'react';

export function KeyboardHelp({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  return <dialog ref={dialogRef} className="help-dialog" aria-labelledby="help-title">
    <form method="dialog"><button className="icon-button close-help" aria-label="Close keyboard shortcuts"><X size={20} /></button></form>
    <span className="eyebrow">MAKE YOURSELF AT HOME</span>
    <h2 id="help-title">A few little shortcuts.</h2>
    <p>Less clicking. More thinking.</p>
    <dl className="shortcuts">
      <div><dt>Pen / Eraser / Hand</dt><dd><kbd>P</kbd><kbd>E</kbd><kbd>H</kbd></dd></div>
      <div><dt>Temporarily pan</dt><dd><kbd>Space</kbd> + drag</dd></div>
      <div><dt>Pan the canvas</dt><dd>Scroll / two-finger drag</dd></div>
      <div><dt>Zoom at your cursor</dt><dd><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + scroll</dd></div>
      <div><dt>Zoom in / out</dt><dd><kbd>+</kbd><kbd>−</kbd></dd></div>
      <div><dt>Fit drawing / Actual size</dt><dd><kbd>0</kbd><kbd>1</kbd></dd></div>
      <div><dt>Undo</dt><dd><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Z</kbd></dd></div>
      <div><dt>Redo</dt><dd><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></dd></div>
    </dl>
    <p className="help-note">On touchscreens, use two fingers to pan and pinch to zoom. The eraser removes whole strokes. Your workspace is saved in this browser.</p>
  </dialog>;
}
