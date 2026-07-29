import { useEffect, useReducer, useRef } from 'react';
import type { ChartState } from '../model/types';
import { newChartState } from '../model/defaults';
import { computeAxisMax } from '../model/axis';
import { parseCsv, serializeCsv } from '../model/csv';
import { reorderWithinBay } from '../model/drag';
import { clearDraft, loadDraft, saveDraft } from '../state/draft';
import { exportPdf, exportPng } from '../render/exportImage';
import TopBar from '../components/TopBar';
import Chart from '../components/Chart';
import ParkingLot from '../components/ParkingLot';
import { NoticeBar, RecoveryBanner } from '../components/Notices';
import type { Notice } from '../components/Notices';

interface EditorState {
  chart: ChartState;
  dirty: boolean;
  showRecovery: boolean;
  notice: Notice | null;
}

type Action =
  | { type: 'new-chart' }
  | { type: 'load-file'; state: ChartState; warnings: string[] }
  | { type: 'reorder-within-bay'; bay: string; from: number; to: number }
  | { type: 'set-takt'; value: number | null }
  | { type: 'set-axis-max'; value: number }
  | { type: 'fit' }
  | { type: 'keep-draft' }
  | { type: 'discard-draft' }
  | { type: 'export-done' }
  | { type: 'show-error'; messages: string[] }
  | { type: 'dismiss-notice' };

function fitAxis(chart: ChartState): number {
  return computeAxisMax({
    blocks: chart.blocks,
    bays: chart.bays,
    taktMinutes: chart.taktMinutes,
    axisIntervalMinutes: chart.axisIntervalMinutes,
  });
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'new-chart':
      return { chart: newChartState(), dirty: false, showRecovery: false, notice: null };
    case 'load-file':
      return {
        chart: action.state,
        dirty: false,
        showRecovery: false,
        notice:
          action.warnings.length > 0
            ? { kind: 'warning', messages: action.warnings }
            : null,
      };
    case 'reorder-within-bay': {
      const blocks = reorderWithinBay(
        state.chart.blocks,
        action.bay,
        action.from,
        action.to,
      );
      if (blocks === state.chart.blocks) return state;
      return { ...state, chart: { ...state.chart, blocks }, dirty: true };
    }
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
      return { ...state, chart, dirty: true };
    }
    case 'set-axis-max': {
      if (action.value === state.chart.axisMaxMinutes) return state;
      return {
        ...state,
        chart: { ...state.chart, axisMaxMinutes: action.value },
        dirty: true,
      };
    }
    case 'fit': {
      const axisMaxMinutes = fitAxis(state.chart);
      if (axisMaxMinutes === state.chart.axisMaxMinutes) return state;
      return { ...state, chart: { ...state.chart, axisMaxMinutes }, dirty: true };
    }
    case 'keep-draft':
      return { ...state, showRecovery: false };
    case 'discard-draft':
      return { chart: newChartState(), dirty: false, showRecovery: false, notice: null };
    case 'export-done':
      return { ...state, dirty: false };
    case 'show-error':
      return { ...state, notice: { kind: 'error', messages: action.messages } };
    case 'dismiss-notice':
      return { ...state, notice: null };
  }
}

function init(): EditorState {
  const draft = loadDraft();
  if (draft) {
    return { chart: draft, dirty: true, showRecovery: true, notice: null };
  }
  return { chart: newChartState(), dirty: false, showRecovery: false, notice: null };
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

  return (
    <div className="editor">
      <TopBar
        taktMinutes={state.chart.taktMinutes}
        axisMaxMinutes={state.chart.axisMaxMinutes}
        onNew={handleNew}
        onOpenText={handleOpenText}
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
      />
      {state.showRecovery && (
        <RecoveryBanner
          onKeep={() => dispatch({ type: 'keep-draft' })}
          onDiscard={() => {
            clearDraft();
            dispatch({ type: 'discard-draft' });
          }}
        />
      )}
      {state.notice && (
        <NoticeBar
          notice={state.notice}
          onDismiss={() => dispatch({ type: 'dismiss-notice' })}
        />
      )}
      <Chart
        chart={state.chart}
        onFit={() => dispatch({ type: 'fit' })}
        onReorderWithinBay={(bay, from, to) =>
          dispatch({ type: 'reorder-within-bay', bay, from, to })
        }
        onSizeChange={(size) => {
          chartSizeRef.current = size;
        }}
      />
      <ParkingLot chart={state.chart} />
    </div>
  );
}
