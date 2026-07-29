import { useEffect, useRef, useState } from 'react';
import type { Category } from '../model/types';
import type { BlockFields } from '../model/mutations';
import Button from './Button';
import Field from './Field';
import CategoryCombobox from './CategoryCombobox';

// SPEC 9.2: exactly three fields, an X in the top right, Esc and backdrop
// close, and a Delete button in edit mode. Unsaved edits prompt before
// discarding.

export interface BlockDraft {
  process: string;
  minutes: string;
  category: string | null;
}

interface BlockModalProps {
  mode: 'add' | 'edit';
  destination: string; // bay the new block will land in
  categories: readonly Category[];
  initial: BlockDraft;
  onSubmit: (fields: BlockFields) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function BlockModal({
  mode,
  destination,
  categories,
  initial,
  onSubmit,
  onDelete,
  onClose,
}: BlockModalProps) {
  const [draft, setDraft] = useState<BlockDraft>(initial);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const isDirty =
    draft.process !== initial.process ||
    draft.minutes !== initial.minutes ||
    draft.category !== initial.category;

  const requestClose = () => {
    if (
      isDirty &&
      !window.confirm('Discard your changes to this step?')
    ) {
      return;
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const submit = () => {
    const process = draft.process.trim();
    if (process === '') {
      setError('Give the step a name.');
      return;
    }
    const minutes = Number(draft.minutes.trim());
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError('Time must be a number greater than 0.');
      return;
    }
    onSubmit({ process, minutes, category: draft.category });
  };

  return (
    <div className="scrim" onMouseDown={requestClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Edit step' : 'Add step'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={requestClose} aria-label="Close">
          x
        </button>
        <div className="modal-title">{mode === 'edit' ? 'Edit step' : 'Add step'}</div>
        {mode === 'add' && (
          <div className="modal-sub">Lands at the top of {destination}</div>
        )}

        <Field
          id="block-process"
          label="Process name"
          placeholder="e.g. Torque deck bolts"
          ref={nameRef}
          value={draft.process}
          onChange={(e) => {
            setDraft({ ...draft, process: e.target.value });
            setError('');
          }}
        />
        <Field
          id="block-minutes"
          label="Time (minutes)"
          inputMode="decimal"
          placeholder="e.g. 45"
          value={draft.minutes}
          onChange={(e) => {
            setDraft({ ...draft, minutes: e.target.value });
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <CategoryCombobox
          categories={categories}
          value={draft.category}
          onChange={(category) => setDraft({ ...draft, category })}
        />

        {error !== '' && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <Button variant="primary" onClick={submit}>
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
          {mode === 'edit' && onDelete && (
            <Button variant="danger" icon="x" onClick={onDelete}>
              Delete
            </Button>
          )}
          <div className="spacer" />
          <Button onClick={requestClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
