export type SheetSnap = 'peek' | 'half' | 'full';

export const SHEET_SNAP_ORDER: readonly SheetSnap[] = ['peek', 'half', 'full'];

export const SHEET_HEIGHT_BY_SNAP: Record<SheetSnap, string> = {
  peek: '96px',
  half: '50%',
  full: 'calc(100% - 24px)',
};

const DRAG_STEP_THRESHOLD_PX = 24;
const DRAG_JUMP_THRESHOLD_PX = 160;

export function getNextSheetSnap(current: SheetSnap, direction: 'up' | 'down'): SheetSnap {
  const index = SHEET_SNAP_ORDER.indexOf(current);
  if (direction === 'up') {
    return SHEET_SNAP_ORDER[Math.min(SHEET_SNAP_ORDER.length - 1, index + 1)] ?? 'full';
  }
  return SHEET_SNAP_ORDER[Math.max(0, index - 1)] ?? 'peek';
}

export function resolveSheetSnapFromDrag(current: SheetSnap, deltaY: number): SheetSnap {
  if (deltaY <= -DRAG_JUMP_THRESHOLD_PX) {
    return 'full';
  }
  if (deltaY <= -DRAG_STEP_THRESHOLD_PX) {
    return getNextSheetSnap(current, 'up');
  }
  if (deltaY >= DRAG_JUMP_THRESHOLD_PX) {
    return 'peek';
  }
  if (deltaY >= DRAG_STEP_THRESHOLD_PX) {
    return getNextSheetSnap(current, 'down');
  }
  return current;
}
