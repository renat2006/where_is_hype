import clsx from 'clsx';
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
  useRef,
  useState,
} from 'react';

import {
  getNextSheetSnap,
  resolveSheetSnapFromDrag,
  SHEET_HEIGHT_BY_SNAP,
  SHEET_SNAP_ORDER,
  type SheetSnap,
} from './sheet-utils';

export interface SheetProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  snap?: SheetSnap;
  defaultSnap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  onClose?: () => void;
  header?: ReactNode;
  ariaLabel?: string;
  handleAriaLabel?: string;
  children?: ReactNode;
}

export function Sheet({
  snap: controlledSnap,
  defaultSnap = 'peek',
  onSnapChange,
  onClose,
  header,
  ariaLabel = 'Список мест',
  handleAriaLabel = 'Изменить размер шторки',
  className,
  style,
  children,
  onKeyDown,
  ...rest
}: SheetProps) {
  const [uncontrolledSnap, setUncontrolledSnap] = useState<SheetSnap>(defaultSnap);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const currentSnap = controlledSnap ?? uncontrolledSnap;

  const dragStateRef = useRef<{
    active: boolean;
    startY: number;
    currentY: number;
  }>({
    active: false,
    startY: 0,
    currentY: 0,
  });

  const updateSnap = (nextSnap: SheetSnap) => {
    if (controlledSnap === undefined) {
      setUncontrolledSnap(nextSnap);
    }
    if (nextSnap !== currentSnap) {
      onSnapChange?.(nextSnap);
    }
  };

  const startDrag = (clientY: number) => {
    dragStateRef.current = {
      active: true,
      startY: clientY,
      currentY: clientY,
    };
    setDragOffsetY(0);
  };

  const moveDrag = (clientY: number) => {
    if (!dragStateRef.current.active) {
      return;
    }
    dragStateRef.current.currentY = clientY;
    setDragOffsetY(clientY - dragStateRef.current.startY);
  };

  const finishDrag = (clientY?: number) => {
    if (!dragStateRef.current.active) {
      return;
    }
    const endY = clientY ?? dragStateRef.current.currentY;
    const deltaY = endY - dragStateRef.current.startY;
    dragStateRef.current.active = false;
    setDragOffsetY(0);

    const nextSnap = resolveSheetSnapFromDrag(currentSnap, deltaY);
    updateSnap(nextSnap);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    startDrag(event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    moveDrag(event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    finishDrag(event.clientY);
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (touch) {
      startDrag(touch.clientY);
    }
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (touch) {
      moveDrag(touch.clientY);
    }
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0];
    finishDrag(touch ? touch.clientY : undefined);
  };

  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (!dragStateRef.current.active) {
      startDrag(event.clientY);
    }
  };

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    if (dragStateRef.current.active) {
      moveDrag(event.clientY);
    }
  };

  const handleMouseUp = (event: MouseEvent<HTMLElement>) => {
    if (dragStateRef.current.active) {
      finishDrag(event.clientY);
    }
  };

  const handleKeyNavigation = (event: KeyboardEvent<HTMLElement>, isHandle: boolean) => {
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (!isHandle && (targetTag === 'INPUT' || targetTag === 'TEXTAREA')) {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      event.stopPropagation();
      updateSnap(getNextSheetSnap(currentSnap, 'up'));
    } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      event.stopPropagation();
      updateSnap(getNextSheetSnap(currentSnap, 'down'));
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      updateSnap('full');
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      updateSnap('peek');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      updateSnap('peek');
      onClose?.();
    } else if (isHandle && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      const idx = SHEET_SNAP_ORDER.indexOf(currentSnap);
      const next = SHEET_SNAP_ORDER[(idx + 1) % SHEET_SNAP_ORDER.length] ?? 'peek';
      updateSnap(next);
    }
  };

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      data-snap={currentSnap}
      style={{
        height: SHEET_HEIGHT_BY_SNAP[currentSnap],
        transform: dragOffsetY !== 0 ? `translateY(${String(dragOffsetY)}px)` : undefined,
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        finishDrag();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={(event) => {
        handleKeyNavigation(event, false);
        onKeyDown?.(event);
      }}
      className={clsx(
        'absolute right-0 bottom-0 left-0 z-10 box-border flex flex-col overflow-hidden rounded-t-lg border-t-[1.5px] border-ink bg-surface text-ink transition-[height,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
        className,
      )}
      {...rest}
    >
      <button
        type="button"
        aria-label={handleAriaLabel}
        aria-expanded={currentSnap !== 'peek'}
        onKeyDown={(event) => {
          handleKeyNavigation(event, true);
        }}
        className="flex min-h-6 w-full shrink-0 cursor-grab touch-none flex-col items-center justify-center border-0 bg-transparent pt-2 pb-1 focus-visible:outline-[2.5px] focus-visible:outline-offset-[-2px] focus-visible:outline-ink active:cursor-grabbing"
      >
        <span aria-hidden="true" className="h-1 w-9 rounded-[4px] bg-ink-muted" />
      </button>

      {header && <div className="shrink-0 px-4 pt-1 pb-2">{header}</div>}

      <div
        className={clsx(
          'flex min-h-0 flex-1 flex-col',
          currentSnap === 'peek' ? 'overflow-hidden' : 'overflow-y-auto',
        )}
      >
        {children}
      </div>
    </section>
  );
}
