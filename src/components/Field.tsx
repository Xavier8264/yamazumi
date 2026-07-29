import type { ComponentPropsWithRef, ReactNode } from 'react';

// Port of BayTrackerDesignSystem.Field (components/controls/Field.jsx):
// muted label above, dark control, optional hint below. Styling lives in
// index.css under .dsfield.

interface FieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  hint?: ReactNode;
}

export default function Field({ label, hint, id, ...rest }: FieldProps) {
  return (
    <div className="dsfield">
      <label className="dsfield-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="dsfield-control" {...rest} />
      {hint !== undefined && <div className="dsfield-hint">{hint}</div>}
    </div>
  );
}
