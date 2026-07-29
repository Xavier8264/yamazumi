import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { COLUMN_PADDING, MARGIN, layout } from '../model/layout';
import type { LayoutRect } from '../model/layout';
import type { Block, ChartState } from '../model/types';
import { bottomStackSortingStrategy } from './sortStrategy';
import { blockFontSize, formatMinutes, textColorFor } from './format';
import { containerIdFor } from './dndIds';

// DOM renderer. All geometry comes from layout(); this file only paints and
// wires interaction. Blocks live in per-bay flex containers with
// flex-direction: column-reverse so DOM order matches array order and index 0
// sits at the baseline (SPEC 9.3).

interface ChartProps {
  chart: ChartState;
  presenting: boolean;
  onFit: () => void;
  onEditBlock: (id: string) => void;
  onAddToBay: (bay: string) => void;
  onRenameBay: (from: string, to: string) => void;
  onRemoveBay: (bay: string) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
}

export function BlockBody({ rect }: { rect: LayoutRect }) {
  const color = textColorFor(rect.fill);
  // Size travels as a custom property so presentation mode can scale it in
  // CSS; an inline font-size would win over the .presenting rule.
  const style = {
    color,
    textShadow: color === '#ffffff' ? '0 1px 2px rgba(0, 0, 0, 0.35)' : 'none',
    '--block-fs': blockFontSize(rect.h) + 'px',
  } as React.CSSProperties;
  return (
    <div className="block-label" style={style}>
      <span className="block-name">{rect.label}</span>
      <span className="block-min">{formatMinutes(rect.minutes)}</span>
    </div>
  );
}

function SortableBlock({
  rect,
  presenting,
  onEdit,
}: {
  rect: LayoutRect;
  presenting: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rect.id, disabled: presenting });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'block dragging' : 'block'}
      title={rect.label + ' - ' + formatMinutes(rect.minutes) + ' min'}
      onClick={presenting ? undefined : onEdit}
      style={{
        height: rect.h,
        background: rect.fill,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {rect.labelFits && <BlockBody rect={rect} />}
    </div>
  );
}

function BayColumn({
  bay,
  items,
  rectById,
  presenting,
  style,
  onEditBlock,
}: {
  bay: string;
  items: Block[];
  rectById: Map<string, LayoutRect>;
  presenting: boolean;
  style: React.CSSProperties;
  onEditBlock: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerIdFor(bay) });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'bay-column over' : 'bay-column'}
      style={style}
    >
      <SortableContext
        items={items.map((b) => b.id)}
        strategy={bottomStackSortingStrategy}
      >
        {items.map((b) => {
          const rect = rectById.get(b.id);
          return rect ? (
            <SortableBlock
              key={b.id}
              rect={rect}
              presenting={presenting}
              onEdit={() => onEditBlock(b.id)}
            />
          ) : null;
        })}
      </SortableContext>
    </div>
  );
}

// SPEC 9.5: click a bay header to rename inline. Commits on blur or Enter so
// a rename is one undo entry, not one per keystroke.
function BayHeader({
  bay,
  canRemove,
  presenting,
  onAdd,
  onRename,
  onRemove,
}: {
  bay: string;
  canRemove: boolean;
  presenting: boolean;
  onAdd: () => void;
  onRename: (to: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(bay);
  useEffect(() => setText(bay), [bay]);

  if (presenting) return <div className="bay-name-static">{bay}</div>;

  // Both controls trail the name so each pair reads as belonging to the bay on
  // its left. Splitting them to the two edges puts one bay's "+" right next to
  // the previous bay's "x".
  return (
    <>
      <input
        className="bay-name"
        value={text}
        aria-label={'Rename ' + bay}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onRename(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(bay);
            e.currentTarget.blur();
          }
        }}
      />
      <button className="bay-btn" onClick={onAdd} title={'Add a step to the top of ' + bay}>
        +
      </button>
      <button
        className="bay-btn"
        onClick={onRemove}
        disabled={!canRemove}
        title={
          canRemove
            ? 'Remove ' + bay + '. Its steps move to the parking lot.'
            : 'A chart keeps at least one bay.'
        }
      >
        x
      </button>
    </>
  );
}

export default function Chart({
  chart,
  presenting,
  onFit,
  onEditBlock,
  onAddToBay,
  onRenameBay,
  onRemoveBay,
  onSizeChange,
}: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sizeCallbackRef = useRef(onSizeChange);
  sizeCallbackRef.current = onSizeChange;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize(next);
      if (next.width > 0 && next.height > 0) sizeCallbackRef.current?.(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

      {r.bayHeaders.map((h) => (
        <BayColumn
          key={h.bay}
          bay={h.bay}
          items={blocksByBay.get(h.bay) ?? []}
          rectById={rectById}
          presenting={presenting}
          onEditBlock={onEditBlock}
          style={{
            left: h.x + COLUMN_PADDING,
            top: r.plot.y,
            width: Math.max(0, h.w - COLUMN_PADDING * 2),
            height: r.plot.h,
          }}
        />
      ))}

      {r.bayHeaders.map((h) => {
        // Floats just above the stack, but never rides up into the bay name:
        // an overflowing column parks its total in the band between the two.
        const totalY = Math.min(
          Math.max(h.topY - 22, r.plot.y - 18),
          plotBottom - 22,
        );
        return (
          <div key={h.bay} className="chart-group">
            <div className="bay-header" style={{ left: h.x, width: h.w, top: 8 }}>
              <BayHeader
                bay={h.bay}
                canRemove={chart.bays.length > 1}
                presenting={presenting}
                onAdd={() => onAddToBay(h.bay)}
                onRename={(to) => onRenameBay(h.bay, to)}
                onRemove={() => onRemoveBay(h.bay)}
              />
            </div>
            {/* SPEC 7: the total sits just above the topmost block. It is
                never recolored when the column exceeds takt -- the height
                against the dotted line is the message. */}
            <div className="bay-total" style={{ left: h.x, width: h.w, top: totalY }}>
              {formatMinutes(h.totalMinutes)}
            </div>
            {/* SPEC 6: an over-axis column is never clipped silently. The
                marker says by how much and runs Fit. */}
            {overflowByBay.has(h.bay) && (
              <div
                className="overflow-slot"
                style={{ left: h.x, width: h.w, top: r.plot.y + 4 }}
              >
                <button
                  className="overflow-chevron"
                  title="Column exceeds the axis. Click to fit."
                  onClick={onFit}
                >
                  ^ +{formatMinutes(overflowByBay.get(h.bay) ?? 0)} min
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
