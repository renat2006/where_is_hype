import clsx from 'clsx';
import { Link, NavLink } from 'react-router';

export interface BottomNavProps {
  eveningCount?: number;
  shortlistCount?: number;
}

export function BottomNav({ eveningCount, shortlistCount }: BottomNavProps) {
  const count = eveningCount ?? shortlistCount ?? 0;

  return (
    <nav
      aria-label="Основная"
      className="fixed right-0 bottom-0 left-0 z-20 mx-auto flex h-[76px] w-full max-w-[430px] items-center justify-around border-t-[1.5px] border-line bg-surface px-4"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          clsx(
            'flex min-h-11 min-w-[72px] flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink',
            isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>Места</span>
            <span
              aria-hidden="true"
              className={clsx(
                'h-[3px] w-5 rounded-[2px]',
                isActive ? 'bg-marker' : 'bg-transparent',
              )}
            />
          </>
        )}
      </NavLink>

      <Link
        to="/add"
        aria-label="Добавить место"
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-ink bg-marker text-on-marker no-underline shadow-raised transition-[transform,box-shadow] duration-150 ease-out hover:text-on-marker focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink active:translate-y-[3px] active:shadow-none"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      <NavLink
        to="/evening"
        end
        className={({ isActive }) =>
          clsx(
            'flex min-h-11 min-w-[72px] flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink',
            isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 22V4a1 1 0 0 1 1-1h12l-3 5 3 5H5" />
            </svg>
            <span className="inline-flex items-baseline gap-1">
              <span>На вечер</span>
              <span className="font-mono text-[11px] leading-none">{count}</span>
            </span>
            <span
              aria-hidden="true"
              className={clsx(
                'h-[3px] w-5 rounded-[2px]',
                isActive ? 'bg-marker' : 'bg-transparent',
              )}
            />
          </>
        )}
      </NavLink>
    </nav>
  );
}
