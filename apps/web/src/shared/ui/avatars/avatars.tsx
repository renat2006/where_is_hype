import clsx from 'clsx';

import {
  AVATAR_BG_CLASS_BY_COLOR,
  type AvatarPerson,
  getAvatarColorByName,
  getInitials,
} from './avatars-utils';

export interface AvatarsProps {
  items: readonly (string | AvatarPerson)[];
  maxVisible?: number;
  totalCount?: number;
  showLabel?: boolean;
  labelSuffix?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatars({
  items,
  maxVisible = 3,
  totalCount,
  showLabel = false,
  labelSuffix = 'подходит',
  size = 'md',
  className,
}: AvatarsProps) {
  const normalizedItems = items.map((item, idx) =>
    typeof item === 'string'
      ? { id: `${item}-${String(idx)}`, name: item }
      : { id: item.id ?? `${item.name}-${String(idx)}`, name: item.name },
  );

  const total = totalCount ?? normalizedItems.length;
  const visible = normalizedItems.slice(0, maxVisible);
  const extraCount = Math.max(0, total - visible.length);

  const sizeClasses =
    size === 'sm' ? 'h-[26px] w-[26px] text-[10px] -ml-[7px]' : 'h-8 w-8 text-xs -ml-2';

  return (
    <div
      className={clsx('inline-flex items-center', size === 'sm' ? 'pl-[7px]' : 'pl-2', className)}
    >
      {visible.map((person) => {
        const color = getAvatarColorByName(person.name);
        const initials = getInitials(person.name);

        return (
          <span
            key={person.id}
            title={person.name}
            data-avatar-color={color}
            className={clsx(
              'box-border flex shrink-0 items-center justify-center rounded-full border-2 border-surface font-ui leading-none font-semibold text-st-ink',
              sizeClasses,
              AVATAR_BG_CLASS_BY_COLOR[color],
            )}
          >
            {initials}
          </span>
        );
      })}

      {extraCount > 0 && (
        <span
          data-testid="avatars-overflow"
          className={clsx(
            'box-border flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-surface font-mono leading-none font-semibold text-ink',
            size === 'sm' ? '-ml-[7px] h-[26px] w-[26px] text-[10px]' : '-ml-2 h-8 w-8 text-[11px]',
          )}
        >
          +{extraCount}
        </span>
      )}

      {showLabel && (
        <span className="ml-2.5 font-ui text-sm leading-5 text-ink">
          <span className="font-mono text-[13px]">{total}</span> {labelSuffix}
        </span>
      )}
    </div>
  );
}
