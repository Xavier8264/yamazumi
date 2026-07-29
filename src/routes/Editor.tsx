import { useEffect, useReducer, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  ClientRect,
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  Over,
} from '@dnd-kit/core';
import { PARKING } from '../model/types';
import type { ChartState } from '../model/types';
import { newChartState } from '../model/defaults';
import { computeAxisMax } from '../model/axis';
import { parseCsv, serializeCsv } from '../model/csv';
import { dropIndexFor, moveBlockTo } from '../model/drag';
import { layout } from '../model/layout';
import {
  addBay,
  addBlock,
  deleteBlock,
  ensureCategory,
  removeBay,
  renameBay,
  updateBlock,
} from '../model/mutations';
import type { BlockFields } from '../model/mutations';
import * as h from '../model/history';
import { clearDraft, loadDraft, saveDraft } from '../state/draft';
import { exportPdf, exportPng } from '../render/exportImage';
import TopBar from '../components/TopBar';
import Chart, { BlockBody } from '../components/Chart';
import ParkingLot, { ChipBody, chipColorFor } from '../components/ParkingLot';
import Legend from '../components/Legend';
import Toast from '../components/Toast';
import BlockModal from '../components/BlockModal';
import { NoticeBar, RecoveryBanner } from '../components/Notices';
import type { Notice } from '../components/Notices';
import { bayFromContainerId } from '../components/dndIds';
import { formatMinutes } from '../components/format';

interface ModalState {
  mode: 'add' | 'edit';
  bay: string; // destination for 'add'
  id: string; // target for 'edit'
}

// Everything a drag needs to put back if it ends up changing nothing (or is
// cancelled). Captured once at drag start; a drag mutates the real state as
// it goes so neighbors reflow live (SPEC 9.3).
interface DragBase {
  chart: ChartState;
  history: h.History;
  dirty: boolean;
}

interface EditorState {
  chart: ChartState;
  history: h.History;
  dirty: boolean;
  showRecovery: boolean;
  notice: Notice | null;
  modal: ModalState | null;
  presenting: boolean;
  toast: { nonce: number; text: string } | null;
  dragId: string | null;
  dragBase: DragBase | null;
}

type Action =
  | { type: 'new-chart' }
  | { type: 'load-file'; state: ChartState; warnings: string[] }
  | { type: 'set-takt'; value: number | null }
  | { type: 'set-axis-max'; value: number }
  | { type: 'fit' }
  | { type: 'keep-draft' }
  | { type: 'discard-draft' }
  | { type: 'export-done' }
  | { type: 'show-error'; messages: string[] }
  | { type: 'dismiss-notice' }
  | { type: 'open-add'; bay: string }
  | { type: 'open-edit'; id: string }
  | { type: 'close-modal' }
  | { type: 'submit-block'; fields: BlockFields }
  | { type: 'delete-block' }
  | { type: 'add-bay' }
  | { type: 'rename-bay'; from: string; to: string }
  | { type: 'remove-bay'; bay: string }
  | { type: 'drag-start'; id: string }
  | { type: 'drag-move'; id: string; bay: string; index: number }
  | { type: 'drag-end' }
  | { type: 'drag-cancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'toggle-present' }
  | { type: 'clear-toast' };

function fitAxis(chart: ChartState): number {
  return computeAxisMax({
    blocks: chart.blocks,
    bays: chart.bays,
    taktMinutes: chart.taktMinutes,
    axisIntervalMinutes: chart.axisIntervalMinutes,
  });
}

function withToast(state: EditorState, text: string): EditorState {
  return { ...state, toast: { nonce: (state.toast?.nonce ?? 0) + 1, text } };
}

// Applies an edit: records the pre-edit chart as an undo point (SPEC 9.4) and
// marks the state dirty. A no-op edit records nothing.
function edit(state: EditorState, chart: ChartState, toast?: string): EditorState {
  if (chart === state.chart) return state;
  const next: EditorState = {
    ...state,
    chart,
    history: h.push(state.history, state.chart),
    dirty: true,
  };
  return toast === undefined ? next : withToast(next, toast);
}

function fresh(chart: ChartState): EditorState {
  return {
    chart,
    history: h.emptyHistory,
    dirty: false,
    showRecovery: false,
    notice: null,
    modal: null,
    presenting: false,
    toast: null,
    dragId: null,
    dragBase: null,
  };
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'new-chart':
      return fresh(newChartState());

    case 'load-file':
      return {
        ...fresh(action.state),
        notice:
          action.warnings.length > 0
            ? { kind: 'warning', messages: action.warnings }
            : null,
      };

    case 'set-takt': {
      if (action.value === state.chart.taktMinutes) return state;
      const chart = { ...state.chart, taktMinutes: action.value };
      // SPEC 6: recompute the axis when takt is entered for the first time
      // on an empty chart. Never on later edits.
      const firstTaktOnEmptyChart =
        state.chart.taktMinutes === null &&
        action.value !== null &&
        state.chart.blocks.length === 0;
      if (firstTaktOnEmptyChart) chart.axisMaxMinutes = fitAxis(chart);
      return edit(state, chart);
    }

    case 'set-axis-max': {
      if (action.value === state.chart.axisMaxMinutes) return state;
      return edit(state, { ...state.chart, axisMaxMinutes: action.value });
    }

    case 'fit': {
      const axisMaxMinutes = fitAxis(state.chart);
      if (axisMaxMinutes === state.chart.axisMaxMinutes) return state;
      return edit(state, { ...state.chart, axisMaxMinutes });
    }

    case 'keep-draft':
      return { ...state, showRecovery: false };

    case 'discard-draft':
      return fresh(newChartState());

    case 'export-done':
      return withToast({ ...state, dirty: false }, 'CSV exported');

    case 'show-error':
      return { ...state, notice: { kind: 'error', messages: action.messages } };

    case 'dismiss-notice':
      return { ...state, notice: null };

    case 'open-add':
      return { ...state, modal: { mode: 'add', bay: action.bay, id: '' } };

    case 'open-edit':
      return { ...state, modal: { mode: 'edit', bay: '', id: action.id } };

    case 'close-modal':
      return { ...state, modal: null };

    case 'submit-block': {
      const m = state.modal;
      if (!m) return state;
      // SPEC 10: a category typed in the combobox is created on submit with
      // the next unused palette color.
      let chart = state.chart;
      if (action.fields.category !== null) {
        chart = ensureCategory(chart, action.fields.category);
      }
      chart =
        m.mode === 'add'
          ? addBlock(chart, m.bay, action.fields)
          : updateBlock(chart, m.id, action.fields);
      const where = m.bay === PARKING ? ' to the parking lot' : ' to ' + m.bay;
      return {
        ...edit(state, chart, m.mode === 'add' ? 'Step added' + where : 'Step updated'),
        modal: null,
      };
    }

    case 'delete-block': {
      const m = state.modal;
      if (!m || m.mode !== 'edit') return state;
      return {
        ...edit(state, deleteBlock(state.chart, m.id), 'Step deleted'),
        modal: null,
      };
    }

    case 'add-bay':
      return edit(state, addBay(state.chart));

    case 'rename-bay':
      return edit(state, renameBay(state.chart, action.from, action.to));

    case 'remove-bay': {
      const moved = state.chart.blocks.filter((b) => b.bay === action.bay).length;
      const chart = removeBay(state.chart, action.bay);
      if (chart === state.chart) return state;
      return edit(
        state,
        chart,
        moved === 0
          ? action.bay + ' removed'
          : action.bay +
              ' removed. ' +
              moved +
              (moved === 1 ? ' step' : ' steps') +
              ' moved to the parking lot.',
      );
    }

    case 'drag-start':
      return {
        ...state,
        dragId: action.id,
        dragBase: {
          chart: state.chart,
          history: state.history,
          dirty: state.dirty,
        },
        history: h.push(state.history, state.chart),
      };

    case 'drag-move': {
      const blocks = moveBlockTo(state.chart.blocks, action.id, action.bay, action.index);
      if (blocks === state.chart.blocks) return state;
      return { ...state, chart: { ...state.chart, blocks }, dirty: true };
    }

    case 'drag-end': {
      const base = state.dragBase;
      // A drag that ended where it started leaves no trace: no undo entry,
      // no dirty flag.
      if (base && state.chart === base.chart) {
        return {
          ...state,
          dragId: null,
          dragBase: null,
          history: base.history,
          dirty: base.dirty,
        };
      }
      return { ...state, dragId: null, dragBase: null };
    }

    case 'drag-cancel': {
      const base = state.dragBase;
      if (!base) return { ...state, dragId: null };
      return {
        ...state,
        chart: base.chart,
        history: base.history,
        dirty: base.dirty,
        dragId: null,
        dragBase: null,
      };
    }

    case 'undo': {
      const step = h.undo(state.history, state.chart);
      if (!step) return state;
      return withToast(
        { ...state, chart: step.present, history: step.history, dirty: true },
        'Undo',
      );
    }

    case 'redo': {
      const step = h.redo(state.history, state.chart);
      if (!step) return state;
      return withToast(
        { ...state, chart: step.present, history: step.history, dirty: true },
        'Redo',
      );
    }

    case 'toggle-present':
      return state.presenting
        ? { ...state, presenting: false }
        : withToast({ ...state, presenting: true }, 'Presentation mode. Esc exits.');

    case 'clear-toast':
      return { ...state, toast: null };
  }
}

function init(): EditorState {
  const draft = loadDraft();
  if (draft) return { ...fresh(draft), dirty: true, showRecovery: true };
  return fresh(newChartState());
}

function downloadCsv(chart: ChartState): void {
  const csv = serializeCsv(chart);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yamazumi.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// A block collides with the container it sits in as well as its siblings.
// Prefer the sibling: it carries a position, a container only means "append".
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const list = pointer.length > 0 ? pointer : closestCorners(args);
  const onBlock = list.find((c) => bayFromContainerId(String(c.id)) === null);
  return onBlock ? [onBlock] : list;
};

// Current pointer position, reconstructed from where the drag started plus how
// far it has travelled. DragOverEvent does not carry it directly.
function pointerAt(e: DragOverEvent | DragEndEvent): { x: number; y: number } | null {
  const a = e.activatorEvent;
  if (!(a instanceof MouseEvent)) return null;
  return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
}

// True when the pointer is genuinely inside the thing we are hovering.
//
// This is the discriminator between the two collision detectors above: if
// pointerWithin found the target the pointer is inside it, and if the
// closestCorners fallback did, it is not. Acting on the fallback is what makes
// a drag over a gap -- the tray header, the band under the columns -- flip
// between the two nearest containers forever, because each move rewrites the
// geometry that picks the next one.
function pointerIsInside(rect: ClientRect, p: { x: number; y: number }): boolean {
  return (
    p.x >= rect.left &&
    p.x <= rect.left + rect.width &&
    p.y >= rect.top &&
    p.y <= rect.top + rect.height
  );
}

// Resolves a dnd-kit hover into "which bay, which index". The index is a
// position in the destination list with the dragged block already removed,
// which is exactly what moveBlockTo expects.
function resolveDrop(
  chart: ChartState,
  activeId: string,
  over: Over,
  activeRect: ClientRect | null,
): { bay: string; index: number } | null {
  const overId = String(over.id);
  const asContainer = bayFromContainerId(overId);
  const bay = asContainer ?? chart.blocks.find((b) => b.id === overId)?.bay;
  if (bay === undefined) return null;

  const items = chart.blocks.filter((b) => b.bay === bay && b.id !== activeId);
  if (asContainer !== null) return { bay, index: items.length };

  const overIndex = items.findIndex((b) => b.id === overId);
  if (overIndex < 0) return { bay, index: items.length };
  if (!activeRect) return { bay, index: overIndex };

  const horizontal = bay === PARKING;
  const activeCenter = horizontal
    ? activeRect.left + activeRect.width / 2
    : activeRect.top + activeRect.height / 2;
  const overMid = horizontal
    ? over.rect.left + over.rect.width / 2
    : over.rect.top + over.rect.height / 2;
  return {
    bay,
    index: dropIndexFor(
      overIndex,
      activeCenter,
      overMid,
      horizontal ? 'horizontal' : 'bottom-stack',
    ),
  };
}

export default function Editor() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const chartSizeRef = useRef({ width: 1200, height: 700 });

  // Crash protection: autosave the draft, debounced 500ms, while dirty.
  useEffect(() => {
    if (!state.dirty) return;
    const timer = window.setTimeout(() => saveDraft(state.chart), 500);
    return () => window.clearTimeout(timer);
  }, [state.chart, state.dirty]);

  // beforeunload guard whenever the state is dirty.
  useEffect(() => {
    if (!state.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.dirty]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(() => dispatch({ type: 'clear-toast' }), 1800);
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  // SPEC 9.4 shortcuts, and SPEC 12.3 Esc to leave presentation mode. The
  // modal owns Esc while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !state.modal) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (e.key === 'Escape' && state.presenting && !state.modal) {
        dispatch({ type: 'toggle-present' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.modal, state.presenting]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    dispatch({ type: 'drag-start', id: String(e.active.id) });
  };

  const dropFor = (e: DragOverEvent | DragEndEvent) => {
    if (!e.over) return null;
    const p = pointerAt(e);
    if (p && !pointerIsInside(e.over.rect, p)) return null;
    return resolveDrop(
      state.chart,
      String(e.active.id),
      e.over,
      e.active.rect.current.translated,
    );
  };

  // Hovering only ever moves a block ACROSS containers. Reordering inside one
  // column is left to bottomStackSortingStrategy, which previews it with
  // transforms and no state change, and is committed on drop.
  //
  // Writing every within-column hover to state instead is an infinite loop:
  // blocks are time-proportional, so moving a tall one rewrites the rects of
  // everything around it, which changes what the (stationary) pointer is over,
  // which moves it again. Container rects do not move, so this is stable.
  const handleDragOver = (e: DragOverEvent) => {
    const drop = dropFor(e);
    if (!drop) return;
    const id = String(e.active.id);
    const from = state.chart.blocks.find((b) => b.id === id)?.bay;
    if (drop.bay === from) return;
    dispatch({ type: 'drag-move', id, bay: drop.bay, index: drop.index });
  };

  // Dropping over a gap keeps whatever the live preview was showing, which is
  // the honest answer: what you saw during the drag is what you get.
  const handleDragEnd = (e: DragEndEvent) => {
    const drop = dropFor(e);
    if (drop) {
      dispatch({
        type: 'drag-move',
        id: String(e.active.id),
        bay: drop.bay,
        index: drop.index,
      });
    }
    dispatch({ type: 'drag-end' });
  };

  const handleNew = () => {
    if (
      state.dirty &&
      !window.confirm('Discard unsaved changes and start a new chart?')
    ) {
      return;
    }
    clearDraft();
    dispatch({ type: 'new-chart' });
  };

  const handleOpenText = (text: string) => {
    const result = parseCsv(text);
    if (result.ok) {
      dispatch({ type: 'load-file', state: result.state, warnings: result.warnings });
    } else {
      dispatch({ type: 'show-error', messages: [result.error] });
    }
  };

  const handleExportCsv = () => {
    downloadCsv(state.chart);
    // Marks the state clean but leaves the draft in place (SPEC 11). Image
    // exports do not touch the dirty flag; only the CSV is the file format.
    dispatch({ type: 'export-done' });
  };

  const handleImageExport = (run: () => Promise<void>) => {
    run().catch((err: unknown) => {
      dispatch({ type: 'show-error', messages: ['Export failed: ' + String(err)] });
    });
  };

  const editingBlock =
    state.modal?.mode === 'edit'
      ? state.chart.blocks.find((b) => b.id === state.modal?.id)
      : undefined;

  const draggedBlock =
    state.dragId !== null
      ? state.chart.blocks.find((b) => b.id === state.dragId)
      : undefined;
  const draggedRect =
    draggedBlock && draggedBlock.bay !== PARKING
      ? layout(state.chart, chartSizeRef.current).blocks.find(
          (b) => b.id === draggedBlock.id,
        )
      : undefined;

  return (
    <div className={state.presenting ? 'editor presenting' : 'editor'}>
      {!state.presenting && (
        <TopBar
          taktMinutes={state.chart.taktMinutes}
          axisMaxMinutes={state.chart.axisMaxMinutes}
          canUndo={h.canUndo(state.history)}
          canRedo={h.canRedo(state.history)}
          onNew={handleNew}
          onOpenText={handleOpenText}
          onAddBlock={() => dispatch({ type: 'open-add', bay: PARKING })}
          onAddBay={() => dispatch({ type: 'add-bay' })}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onExportCsv={handleExportCsv}
          onExportPng={(includeParking) =>
            handleImageExport(() =>
              exportPng(state.chart, chartSizeRef.current, includeParking),
            )
          }
          onExportPdf={(includeParking) =>
            handleImageExport(() =>
              exportPdf(state.chart, chartSizeRef.current, includeParking),
            )
          }
          onTaktChange={(value) => dispatch({ type: 'set-takt', value })}
          onAxisMaxChange={(value) => dispatch({ type: 'set-axis-max', value })}
          onFit={() => dispatch({ type: 'fit' })}
          onPresent={() => dispatch({ type: 'toggle-present' })}
        />
      )}

      {!state.presenting && state.showRecovery && (
        <RecoveryBanner
          onKeep={() => dispatch({ type: 'keep-draft' })}
          onDiscard={() => {
            clearDraft();
            dispatch({ type: 'discard-draft' });
          }}
        />
      )}
      {!state.presenting && state.notice && (
        <NoticeBar
          notice={state.notice}
          onDismiss={() => dispatch({ type: 'dismiss-notice' })}
        />
      )}

      {/* Measuring stays on the WhileDragging default. MeasuringStrategy.Always
          re-measures every droppable after every render, which re-runs
          collision detection, which re-fires onDragOver, which dispatches the
          move that caused the render: an infinite update loop, because a
          cross-column move genuinely changes every block rect in two columns. */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => dispatch({ type: 'drag-cancel' })}
      >
        <Chart
          chart={state.chart}
          presenting={state.presenting}
          onFit={() => dispatch({ type: 'fit' })}
          onEditBlock={(id) => dispatch({ type: 'open-edit', id })}
          onAddToBay={(bay) => dispatch({ type: 'open-add', bay })}
          onRenameBay={(from, to) => dispatch({ type: 'rename-bay', from, to })}
          onRemoveBay={(bay) => dispatch({ type: 'remove-bay', bay })}
          onSizeChange={(size) => {
            chartSizeRef.current = size;
          }}
        />
        <Legend chart={state.chart} />
        {!state.presenting && (
          <ParkingLot
            chart={state.chart}
            onEditBlock={(id) => dispatch({ type: 'open-edit', id })}
          />
        )}
        <DragOverlay dropAnimation={null}>
          {draggedBlock && (
            <div
              className="drag-ghost"
              style={draggedRect ? { background: draggedRect.fill } : undefined}
            >
              {draggedRect ? (
                <BlockBody rect={draggedRect} />
              ) : (
                <ChipBody
                  block={draggedBlock}
                  color={chipColorFor(state.chart, draggedBlock)}
                />
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {state.modal && (
        <BlockModal
          mode={state.modal.mode}
          destination={state.modal.bay === PARKING ? 'the parking lot' : state.modal.bay}
          categories={state.chart.categories}
          initial={
            editingBlock
              ? {
                  process: editingBlock.process,
                  minutes: formatMinutes(editingBlock.minutes),
                  category: editingBlock.category,
                }
              : { process: '', minutes: '', category: null }
          }
          onSubmit={(fields) => dispatch({ type: 'submit-block', fields })}
          onDelete={
            state.modal.mode === 'edit'
              ? () => dispatch({ type: 'delete-block' })
              : undefined
          }
          onClose={() => dispatch({ type: 'close-modal' })}
        />
      )}

      {state.toast && <Toast key={state.toast.nonce} text={state.toast.text} />}
    </div>
  );
}
