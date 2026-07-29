import type { SortingStrategy } from '@dnd-kit/sortable';

// dnd-kit's verticalListSortingStrategy assumes a higher index renders lower
// on screen. Our columns are bottom-anchored and render with column-reverse,
// so a higher index renders HIGHER on screen and every displacement sign
// flips. Same rect math as the built-in strategy, inverted.
export const bottomStackSortingStrategy: SortingStrategy = ({
  activeIndex,
  activeNodeRect: fallbackActiveRect,
  index,
  rects,
  overIndex,
}) => {
  const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect;
  if (!activeNodeRect) return null;

  if (index === activeIndex) {
    const overRect = rects[overIndex];
    if (!overRect) return null;
    return {
      x: 0,
      y:
        activeIndex < overIndex
          ? overRect.top - activeNodeRect.top
          : overRect.top + overRect.height - (activeNodeRect.top + activeNodeRect.height),
      scaleX: 1,
      scaleY: 1,
    };
  }

  if (index > activeIndex && index <= overIndex) {
    // The active block is moving up past this one: it slides DOWN to fill
    // the gap the active block left at the bottom.
    return { x: 0, y: activeNodeRect.height, scaleX: 1, scaleY: 1 };
  }

  if (index < activeIndex && index >= overIndex) {
    // The active block is moving down past this one: it rises to fill the
    // gap above.
    return { x: 0, y: -activeNodeRect.height, scaleX: 1, scaleY: 1 };
  }

  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
};
