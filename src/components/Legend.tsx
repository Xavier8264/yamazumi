import type { ChartState } from '../model/types';
import { legendEntriesFor } from '../render/canvasRenderer';

// SPEC 7: legend strip below the chart, listing the categories in use in
// ChartState.categories order. Entries come from the same function the canvas
// renderer uses, so the screen and an export never disagree. The takt rule is
// the design's addition: it names the dashed line so nobody has to guess.
export default function Legend({ chart }: { chart: ChartState }) {
  const entries = legendEntriesFor(chart);
  if (entries.length === 0) return null;

  return (
    <div className="legend">
      {entries.map((e) => (
        <span key={e.name} className="legend-item">
          {e.dashed === true ? (
            <span className="legend-takt" />
          ) : (
            <span className="legend-swatch" style={{ background: e.color }} />
          )}
          {e.name}
        </span>
      ))}
    </div>
  );
}
