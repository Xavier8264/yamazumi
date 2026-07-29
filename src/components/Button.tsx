import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Port of BayTrackerDesignSystem.Button (components/controls/Button.jsx).
// Heavy, high-contrast, meant to be hit fast. Variants map 1:1 to the app's
// action semantics. Styling lives in index.css under .btn so the whole app
// stays plain CSS; the values match the design system bundle.

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'danger'
  | 'good'
  | 'warn'
  | 'violet';

export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // ASCII glyph drawn ahead of the label. The design system uses Unicode
  // symbols here; this project is ASCII only (CLAUDE.md), so callers pass
  // things like '+' or 'x'.
  icon?: ReactNode;
}

export default function Button({
  variant = 'default',
  size = 'md',
  icon = null,
  children,
  className,
  ...rest
}: ButtonProps) {
  const classes = ['btn', 'btn-' + size, 'btn-' + variant];
  if (className) classes.push(className);
  return (
    <button className={classes.join(' ')} {...rest}>
      {icon !== null && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}
