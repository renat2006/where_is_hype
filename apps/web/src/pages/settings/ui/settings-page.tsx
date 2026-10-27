import clsx from 'clsx';
import { Link } from 'react-router';

import { type ThemeMode, useTheme } from '@/shared/lib/theme';

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: 'Авто · по закату' },
  { value: 'day', label: 'День' },
  { value: 'night', label: 'Ночь' },
];

export function SettingsPage() {
  const { mode, setMode } = useTheme();

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-6 p-4">
      <header className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="Назад"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-ink bg-surface text-ink no-underline transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink active:bg-line"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="m-0 font-display text-xl font-normal">Настройки</h1>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold">Тема</h2>
          <p className="m-0 text-sm text-ink-muted">
            В режиме «Авто» ночная тема включается после заката в Москве.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Тема"
          className="inline-flex w-full items-center justify-between rounded-pill border-[1.5px] border-ink bg-surface p-1"
        >
          {THEME_OPTIONS.map((option) => {
            const isSelected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setMode(option.value);
                }}
                className={clsx(
                  'inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-pill px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink',
                  isSelected ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-line',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
