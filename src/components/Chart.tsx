import { useLayoutEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { COLUMN_PADDING, MARGIN, layout } from '../model/layout';
import type { LayoutRect } from '../model/layout';
import type { Block, ChartState } from '../model/types';
import { bottomStackSortingStrategy } from './sortStrategy';
import { formatMinutes, textColorFor } from './format';

interface ChartProps {
  chart: ChartState;
  onFit: () => void;
  onReorderWithinBay: (bay: string, from: number, to: number) => void;
}

function SortableBlock({ rect }: { rect: LayoutRect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rect.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'block dragging' : 'block'}
      title={rect.label + ' - ' + formatMinutes(rect.minutes) + ' min'}
      style={{
        height: rect.h,
        background: rect.fill,
        color: textColorFor(rect.fill),
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {rect.labelFits && <span className="block-label">{rect.label}</span>}
    </div>
  );
}

// DOM renderer. All geometry comes from layout(); this file only paints.
// Blocks live in per-bay flex containers with flex-direction: column-reverse
// so DOM order matches array order and index 0 sits at the baseline
// (SPEC 9.3).
export default function Chart({ chart, onFit, onReorderWithinBay }: ChartProps) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const r = size.width > 0 && size.height > 0 ? layout(chart, size) : null;
  if (!r) return <div className="chart" ref={ref} />;

  const plotBottom = r.plot.y + r.plot.h;
  const rectById = new Map(r.blocks.map((b) => [b.id, b]));
  const blocksByBay = new Map<string, Block[]>(chart.bays.map((bay) => [bay, []]));
  for (const b of chart.blocks) blocksByBay.get(b.bay)?.push(b);

  const overflowByBay = new Map(
    r.overflowBays.map((bay) => {
      const header = r.bayHeaders.find((h) => h.bay === bay);
      const over = header ? header.totalMinutes - chart.axisMaxMinutes : 0;
      return [bay, over] as const;
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeBlock = chart.blocks.find((b) => b.id === active.id);
    const overBlock = chart.blocks.find((b) => b.id === over.id);
    if (!activeBlock || !overBlock || activeBlock.bay !== overBlock.bay) return;
    const items = blocksByBay.get(activeBlock.bay) ?? [];
    const from = items.findIndex((b) => b.id === activeBlock.id);
    const to = items.findIndex((b) => b.id === overBlock.id);
    if (from >= 0 && to >= 0 && from !== to) {
      onReorderWithinBay(activeBlock.bay, from, to);
    }
  };

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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {r.bayHeaders.map((h) => {
          const items = blocksByBay.get(h.bay) ?? [];
          return (
            <div
              key={h.bay}
              className="bay-column"
              style={{
                left: h.x + COLUMN_PADDING,
                top: r.plot.y,
                width: Math.max(0, h.w - COLUMN_PADDING * 2),
                height: r.plot.h,
              }}
            >
              <SortableContext
                items={items.map((b) => b.id)}
                strategy={bottomStackSortingStrategy}
              >
                {items.map((b) => {
                  const rect = rectById.get(b.id);
                  return rect ? <SortableBlock key={b.id} rect={rect} /> : null;
                })}
              </SortableContext>
            </div>
          );
        })}
      </DndContext>

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
