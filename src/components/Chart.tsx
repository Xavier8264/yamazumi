import { useLayoutEffect, useRef, useState } from 'react';
import { MARGIN, layout } from '../model/layout';
import type { ChartState } from '../model/types';
import { formatMinutes, textColorFor } from './format';

interface ChartProps {
  chart: ChartState;
  onFit: () => void;
}

// Static DOM renderer. All geometry comes from layout(); this file only
// paints absolutely positioned divs.
export default function Chart({ chart, onFit }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const r = size.width > 0 && size.height > 0 ? layout(chart, size) : null;
  if (!r) return <div className="chart" ref={ref} />;

  const plotBottom = r.plot.y + r.plot.h;
  const overflowByBay = new Map(
    r.overflowBays.map((bay) => {
      const header = r.bayHeaders.find((h) => h.bay === bay);
      const over = header ? header.totalMinutes - chart.axisMaxMinutes : 0;
      return [bay, over] as const;
    }),
  );

  return (
    <div className="chart" ref={ref}>
      {r.axisTicks.map((t) => (
        <div key={t.minutes} className="chart-group">
          <div
            className={t.minutes === 0 ? 'gridline baseline' : 'gridline'}
            style={{ left: r.plot.x, width: r.plot.w, top: t.y }}
          />
          <div className="tick-label" style={{ width: MARGIN.left - 10, top: t.y - 8 }}>
            {t.label}
          </div>
        </div>
      ))}

      {r.taktY !== null && r.taktY >= r.plot.y && r.taktY <= plotBottom && (
        <>
          <div
            className="takt-line"
            style={{ left: r.plot.x, width: r.plot.w, top: r.taktY }}
          />
          <div
            className="takt-label"
            style={{ left: r.plot.x + r.plot.w + 8, top: r.taktY - 9 }}
          >
            Takt {formatMinutes(chart.taktMinutes ?? 0)}
          </div>
        </>
      )}

      {r.blocks.map((b) => (
        <div
          key={b.id}
          className="block"
          title={b.label + ' - ' + formatMinutes(b.minutes) + ' min'}
          style={{
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            background: b.fill,
            color: textColorFor(b.fill),
          }}
        >
          {b.labelFits && <span className="block-label">{b.label}</span>}
        </div>
      ))}

      {r.bayHeaders.map((h) => {
        const totalY = Math.min(
          Math.max(h.topY - 20, r.plot.y - 20),
          plotBottom - 20,
        );
        return (
          <div key={h.bay} className="chart-group">
            <div className="bay-name" style={{ left: h.x, width: h.w, top: 8 }}>
              {h.bay}
            </div>
            <div className="bay-total" style={{ left: h.x, width: h.w, top: totalY }}>
              {formatMinutes(h.totalMinutes)}
            </div>
            {overflowByBay.has(h.bay) && (
              <button
                className="overflow-chevron"
                style={{ left: h.x, width: h.w, top: r.plot.y + 4 }}
                title="Column exceeds the axis. Click to fit."
                onClick={onFit}
              >
                ^ +{formatMinutes(overflowByBay.get(h.bay) ?? 0)} min
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
