import { useEffect, useRef, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number | null;
  allowBlank: boolean;
  onCommit: (value: number | null) => void;
}

// Commits on blur or Enter so the scale never jumps mid-keystroke.
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
    <label className="field">
      <span>{label}</span>
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
  onNew: () => void;
  onOpenText: (text: string) => void;
  onExportCsv: () => void;
  onExportPng: (includeParking: boolean) => void;
  onExportPdf: (includeParking: boolean) => void;
  onTaktChange: (value: number | null) => void;
  onAxisMaxChange: (value: number) => void;
  onFit: () => void;
}

function ExportMenu(props: {
  onExportCsv: () => void;
  onExportPng: (includeParking: boolean) => void;
  onExportPdf: (includeParking: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [includeParking, setIncludeParking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (label: string, action: () => void) => (
    <button
      className="export-item"
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="export-menu" ref={wrapRef}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        Export v
      </button>
      {open && (
        <div className="export-dropdown">
          {item('Export CSV', props.onExportCsv)}
          {item('Export PNG', () => props.onExportPng(includeParking))}
          {item('Export PDF', () => props.onExportPdf(includeParking))}
          <label className="export-check">
            <input
              type="checkbox"
              checked={includeParking}
              onChange={(e) => setIncludeParking(e.target.checked)}
            />
            Include parking lot
          </label>
        </div>
      )}
    </div>
  );
}

export default function TopBar(props: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="topbar">
      <button onClick={props.onNew}>New</button>
      <button onClick={() => fileRef.current?.click()}>Open</button>
      <ExportMenu
        onExportCsv={props.onExportCsv}
        onExportPng={props.onExportPng}
        onExportPdf={props.onExportPdf}
      />
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
      <NumberField
        label="Takt"
        value={props.taktMinutes}
        allowBlank={true}
        onCommit={props.onTaktChange}
      />
      <NumberField
        label="Axis"
        value={props.axisMaxMinutes}
        allowBlank={false}
        onCommit={(v) => {
          if (v !== null) props.onAxisMaxChange(v);
        }}
      />
      <button onClick={props.onFit} title="Recompute the axis max to fit the chart">
        Fit
      </button>
    </div>
  );
}
