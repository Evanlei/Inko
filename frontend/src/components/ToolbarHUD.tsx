import { Eraser, Hand, PenLine, Redo2, Undo2 } from 'lucide-react';
import { COLORS } from '../types/canvas';
import type { Tool } from '../types/canvas';

const tools = [
  { id: 'pen', label: 'Pen', key: 'P', icon: PenLine },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser },
  { id: 'hand', label: 'Hand', key: 'H', icon: Hand },
] as const;
const colorNames = ['Graphite', 'Moss', 'Apricot', 'Iris', 'Rose'];
interface Props {
  tool: Tool; color: string; size: number; disabled: boolean; canUndo: boolean; canRedo: boolean;
  onTool: (tool: Tool) => void; onColor: (color: string) => void; onSize: (size: number) => void;
  undo: () => void; redo: () => void;
}
export function ToolbarHUD(props: Props) {
  return <>
    <nav className="tools panel" aria-label="Drawing tools">
      <span className="toolbar-caption">TOOLS</span>
      {tools.map(({ id, label, key, icon: Icon }) => <button key={id} className={`tool-button ${props.tool === id ? 'selected' : ''}`}
        disabled={props.disabled} aria-label={`${label} (${key})`} aria-pressed={props.tool === id} title={`${label} · ${key}`} onClick={() => props.onTool(id)}>
        <Icon size={21} strokeWidth={1.7} /><span className="tool-key">{key}</span>
      </button>)}
      <div className="tool-divider" />
      <button className="icon-button" aria-label="Undo" title="Undo · ⌘/Ctrl Z" disabled={props.disabled || !props.canUndo} onClick={props.undo}><Undo2 size={19} /></button>
      <button className="icon-button" aria-label="Redo" title="Redo · ⌘/Ctrl Shift Z" disabled={props.disabled || !props.canRedo} onClick={props.redo}><Redo2 size={19} /></button>
    </nav>
    <div className="pen-settings panel" aria-label="Pen settings">
      <div className="color-options" role="group" aria-label="Ink color">
        {COLORS.map((color, i) => <button key={color} className={`swatch ${props.color === color ? 'chosen' : ''}`} style={{ '--ink': color } as React.CSSProperties}
          aria-label={`${colorNames[i]} ink`} aria-pressed={props.color === color} title={colorNames[i]} disabled={props.disabled} onClick={() => props.onColor(color)}><span /></button>)}
      </div>
      <span className="settings-divider" />
      <label className="size-control"><span className="size-preview" style={{ width: props.size + 2, height: props.size + 2 }} />
        <input aria-label="Pen size" type="range" min="2" max="16" step="1" value={props.size} disabled={props.disabled} onChange={(e) => props.onSize(Number(e.target.value))} />
      </label>
    </div>
  </>;
}
