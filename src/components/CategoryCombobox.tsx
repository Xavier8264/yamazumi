import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '../model/types';
import { UNCATEGORIZED_COLOR } from '../model/palette';

// SPEC 9.2: filter the list, pick an option, or type a new name and press
// Enter to create it. SPEC 10: no color picker anywhere -- a new category is
// assigned the next unused palette color by the caller. The swatches here are
// read-only, shown so the assignment is visible.

interface CategoryComboboxProps {
  categories: readonly Category[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function CategoryCombobox({
  categories,
  value,
  onChange,
}: CategoryComboboxProps) {
  const [text, setText] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  // null means "follow the default for the current query"; an arrow key pins
  // an explicit row.
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const query = text.trim().toLowerCase();
  const matches = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(query)),
    [categories, query],
  );
  const exact = categories.some((c) => c.name.toLowerCase() === query);
  const canCreate = query !== '' && !exact;

  // Row 0 is always "No category" so a first-time user can opt out without
  // thinking about categories at all (SPEC 10). It is only the DEFAULT
  // highlight while the box is empty: once you type, the highlight moves to
  // row 1 so Enter picks the match, or creates what you typed (SPEC 9.2).
  const defaultActive = query === '' ? 0 : 1;
  const rows: { key: string; label: string; color: string | null; commit: () => void }[] =
    [
      {
        key: '__none',
        label: 'No category',
        color: UNCATEGORIZED_COLOR,
        commit: () => select(null),
      },
      ...matches.map((c) => ({
        key: c.name,
        label: c.name,
        color: c.color,
        commit: () => select(c.name),
      })),
    ];
  if (canCreate) {
    rows.push({
      key: '__create',
      label: 'Create "' + text.trim() + '"',
      color: null,
      commit: () => select(text.trim()),
    });
  }

  function select(next: string | null) {
    onChange(next);
    setText(next ?? '');
    setOpen(false);
    setActive(null);
  }

  const clampedActive = Math.max(
    0,
    Math.min(active ?? defaultActive, rows.length - 1),
  );

  return (
    <div className="dsfield" ref={wrapRef}>
      <label className="dsfield-label" htmlFor="block-category">
        Category
      </label>
      <div className="combo">
        <span
          className="combo-swatch"
          style={{
            background: value
              ? (categories.find((c) => c.name === value)?.color ??
                UNCATEGORIZED_COLOR)
              : UNCATEGORIZED_COLOR,
          }}
        />
        <input
          id="block-category"
          className="dsfield-control combo-input"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="category-listbox"
          placeholder="None. Type to filter or create."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(clampedActive + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(clampedActive - 1, 0));
            } else if (e.key === 'Enter') {
              // Swallowed so Enter picks a category instead of submitting the
              // modal out from under a half-typed name.
              e.preventDefault();
              if (open && rows[clampedActive]) rows[clampedActive].commit();
              else if (canCreate) select(text.trim());
            } else if (e.key === 'Escape' && open) {
              // Close the list only. The modal keeps its own Esc handler.
              e.stopPropagation();
              setOpen(false);
              setText(value ?? '');
            }
          }}
        />
      </div>
      {open && rows.length > 0 && (
        <ul className="combo-list" id="category-listbox" role="listbox">
          {rows.map((row, i) => (
            <li key={row.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === clampedActive}
                className={i === clampedActive ? 'combo-option active' : 'combo-option'}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={row.commit}
              >
                {row.color !== null && (
                  <span className="combo-swatch" style={{ background: row.color }} />
                )}
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
