import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, ChartState } from '../model/types';
import { UNCATEGORIZED_COLOR } from '../model/palette';
import { parkingBlocks } from '../model/totals';
import { formatMinutes } from './format';
import { PARKING_CONTAINER } from './dndIds';

// SPEC 8: a docked, collapsible tray. Chips are NOT time-proportional -- they
// are a fixed height with a dashed border and a muted fill, so the tray never
// reads as a fifth bay. The category color survives only as a small dot;
// filling the chip would put it back in the chart's visual language.

export function chipColorFor(chart: ChartState, block: Block): string {
  if (block.category === null) return UNCATEGORIZED_COLOR;
  return (
    chart.categories.find((c) => c.name === block.category)?.color ??
    UNCATEGORIZED_COLOR
  );
}

export function ChipBody({ block, color }: { block: Block; color: string }) {
  return (
    <>
      <span className="chip-dot" style={{ background: color }} />
      <span className="chip-name">{block.process}</span>
      <span className="chip-min">- {formatMinutes(block.minutes)} min</span>
    </>
  );
}

function ParkingChip({
  block,
  color,
  onEdit,
}: {
  block: Block;
  color: string;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'parking-chip dragging' : 'parking-chip'}
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ChipBody block={block} color={color} />
    </div>
  );
}

interface ParkingLotProps {
  chart: ChartState;
  onEditBlock: (id: string) => void;
}

export default function ParkingLot({ chart, onEditBlock }: ParkingLotProps) {
  const [collapsed, setCollapsed] = useState(false);
  const items = parkingBlocks(chart.blocks);
  const totalMinutes = items.reduce((sum, b) => sum + b.minutes, 0);
  const { setNodeRef, isOver } = useDroppable({ id: PARKING_CONTAINER });

  return (
    <div className="parking">
      <button
        className="parking-header"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <span className="parking-caret">{collapsed ? '>' : 'v'}</span>
        <span className="parking-title">PARKING LOT</span>
        <span className="parking-count">
          ({items.length} {items.length === 1 ? 'item' : 'items'},{' '}
          {formatMinutes(totalMinutes)} min)
        </span>
        <span className="spacer" />
        <span className="parking-hint">Drag steps here to set them aside</span>
      </button>
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={isOver ? 'parking-body over' : 'parking-body'}
        >
          <SortableContext
            items={items.map((b) => b.id)}
            strategy={horizontalListSortingStrategy}
          >
            {items.map((b) => (
              <ParkingChip
                key={b.id}
                block={b}
                color={chipColorFor(chart, b)}
                onEdit={() => onEditBlock(b.id)}
              />
            ))}
          </SortableContext>
          {items.length === 0 && <span className="parking-empty">- empty -</span>}
        </div>
      )}
    </div>
  );
}
