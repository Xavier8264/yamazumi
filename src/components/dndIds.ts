import { PARKING } from '../model/types';

// Droppable container ids for the dnd-kit tree. Blocks use their own block id
// as the sortable id, so container ids are namespaced to keep the two apart.

const BAY_PREFIX = 'bay:';
export const PARKING_CONTAINER = 'parking';

export function containerIdFor(bay: string): string {
  return bay === PARKING ? PARKING_CONTAINER : BAY_PREFIX + bay;
}

// Returns the bay a container id refers to, or null when the id is a block.
export function bayFromContainerId(id: string): string | null {
  if (id === PARKING_CONTAINER) return PARKING;
  if (id.startsWith(BAY_PREFIX)) return id.slice(BAY_PREFIX.length);
  return null;
}
