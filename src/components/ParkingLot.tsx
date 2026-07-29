import { useState } from 'react';
import type { ChartState } from '../model/types';
import { parkingBlocks } from '../model/totals';
import { formatMinutes } from './format';

// SPEC section 8: docked tray, fixed-height chips, never time-proportional.
// No drag in phase 1.
export default function ParkingLot({ chart }: { chart: ChartState }) {
  const [collapsed, setCollapsed] = useState(false);
  const items = parkingBlocks(chart.blocks);
  const totalMinutes = items.reduce((sum, b) => sum + b.minutes, 0);
  const open = !collapsed && items.length > 0;

  return (
    <div className="parking">
      <button
        className="parking-header"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={open}
      >
        <span>
          Parking Lot ({items.length} {items.length === 1 ? 'item' : 'items'},{' '}
          {formatMinutes(totalMinutes)} min)
        </span>
        <span>{open ? '[v]' : '[^]'}</span>
      </button>
      {open && (
        <div className="parking-body">
          {items.map((b) => (
            <span key={b.id} className="parking-chip">
              {b.process} - {formatMinutes(b.minutes)} min
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
