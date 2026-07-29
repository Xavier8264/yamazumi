import type { ChartState } from './types';

// A new chart per SPEC sections 7 and 10: four default bays and the three
// seed categories. axisMaxMinutes starts at the SPEC 6 floor (interval * 2).
export function newChartState(): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4'],
    blocks: [],
    categories: [
      { name: 'Value-Add', color: '#2E7D32' },
      { name: 'Non-Value-Add', color: '#F9A825' },
      { name: 'Waste', color: '#C62828' },
    ],
    taktMinutes: null,
    axisMaxMinutes: 60,
    axisIntervalMinutes: 30,
  };
}
