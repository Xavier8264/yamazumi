import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';

// The design's toolbar: a lettered brand mark, then action groups separated
// by hairline rules, then the numeric fields pushed to the right edge.
// Contents follow SPEC 7: New / Open / Export, Undo / Redo, Takt / Axis / Fit,
// Present. Icons are ASCII per CLAUDE.md, not the design's Unicode glyphs.

interface NumberFieldProps {
  label: string;
  value: number | null;
  allowBlank: boolean;
  onCommit: (value: number | null) => void;
}

// Commits on blur or Enter so the scale never jumps mid-keystroke (SPEC 6).
function NumberField({ label, value, allowBlank, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setText(value === null ? '' : String(value));
  }, [value]);

  const revert = () => setText(value === null ? '' : String(value));

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (allowBlank) onCommit(null);
      else revert();
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) onCommit(n);
    else revert();
  };

  return (
    <label className="numfield">
      <span className="numfield-label">{label}</span>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

interface TopBarProps {
  taktMinutes: number | null;
  axisMaxMinutes: number;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onOpenText: (text: string) => void;
  onAddBlock: () => void;
  onAddBay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportCsv: () => void;
  onExportPng: (includeParking: boolean) => void;
  onExportPdf: (includeParking: boolean) => void;
  onTaktChange: (value: number | null) => void;
  onAxisMaxChange: (value: number) => void;
  onFit: () => void;
  onPresent: () => void;
}

export default function TopBar(props: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  // SPEC 12.2: image exports drop the parking lot unless this is ticked.
  const [includeParking, setIncludeParking] = useState(false);

  return (
    <div className="topbar">
      <div className="brand">YAMAZUMI</div>
      <span className="topbar-sep" />

      <div className="topbar-group">
        <Button size="sm" variant="primary" icon="+" onClick={props.onAddBlock}>
          Add block
        </Button>
        <Button size="sm" icon="+" onClick={props.onAddBay}>
          Add bay
        </Button>
        <Button
          size="sm"
          icon="<-"
          disabled={!props.canUndo}
          onClick={props.onUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </Button>
        <Button
          size="sm"
          icon="->"
          disabled={!props.canRedo}
          onClick={props.onRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </Button>
      </div>

      <span className="topbar-sep" />

      <div className="topbar-group">
        <Button size="sm" onClick={props.onNew}>
          New
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          Open CSV
        </Button>
        <Button size="sm" onClick={props.onExportCsv}>
          Export CSV
        </Button>
        <Button size="sm" onClick={() => props.onExportPng(includeParking)}>
          PNG
        </Button>
        <Button size="sm" onClick={() => props.onExportPdf(includeParking)}>
          PDF
        </Button>
        <label className="checkfield" title="Include the parking lot in PNG and PDF">
          <input
            type="checkbox"
            checked={includeParking}
            onChange={(e) => setIncludeParking(e.target.checked)}
          />
          Parking
        </label>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          const input = e.currentTarget;
          if (file) {
            void file.text().then((text) => props.onOpenText(text));
          }
          input.value = '';
        }}
      />

      <span className="topbar-sep" />

      <div className="topbar-group">
        <Link className="btn btn-sm btn-violet" to="/animate">
          <span className="btn-icon">&gt;&gt;</span>
          Animate
        </Link>
        <Button size="sm" onClick={props.onPresent} title="Presentation mode (Esc exits)">
          Present
        </Button>
      </div>

      <div className="spacer" />

      <div className="topbar-group">
        <NumberField
          label="TAKT"
          value={props.taktMinutes}
          allowBlank={true}
          onCommit={props.onTaktChange}
        />
        <NumberField
          label="AXIS"
          value={props.axisMaxMinutes}
          allowBlank={false}
          onCommit={(v) => {
            if (v !== null) props.onAxisMaxChange(v);
          }}
        />
        <Button
          size="sm"
          onClick={props.onFit}
          title="Recompute the axis max to fit the chart"
        >
          Fit
        </Button>
      </div>
    </div>
  );
}
