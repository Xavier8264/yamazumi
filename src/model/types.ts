export const PARKING = 'Parking Lot';

export interface Block {
  id: string;              // stable, unique within a chart
  bay: string;             // a name from ChartState.bays, or PARKING
  process: string;
  minutes: number;         // > 0, decimals allowed
  category: string | null; // null = uncategorized
}

export interface Category {
  name: string;
  color: string;           // hex, e.g. '#2E7D32'
}

export interface ChartState {
  bays: string[];              // ordered left to right. Does NOT include PARKING.
  blocks: Block[];             // within a bay, array order is bottom-to-top sequence
  categories: Category[];      // order defines legend order
  taktMinutes: number | null;
  axisMaxMinutes: number;
  axisIntervalMinutes: number; // default 30
}
