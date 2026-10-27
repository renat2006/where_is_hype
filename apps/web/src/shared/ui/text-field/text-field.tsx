import clsx from 'clsx';
import { Link2, Search, X } from 'lucide-react';
import {
  type ChangeEvent,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from 'react';

import { Button, LoadingDots } from '@/shared/ui/button';
import { renderWithMonoDigits } from '@/shared/ui/chip';
import { ErrorNote } from '@/shared/ui/error-note';

export type TextFieldVariant = 'link' | 'search' | 'text';
export type TextFieldVisualState = 'default' | 'focus';

export interface TextFieldSuggestion {
  id: string;
  title: string;
  subtitle?: string;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: TextFieldVariant;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  loading?: boolean;
  clearable?: boolean;
  onClear?: () => void;
  onValueChange?: (value: string) => void;
  visualState?: TextFieldVisualState;
  suggestions?: readonly TextFieldSuggestion[];
  selectedSuggestionIndex?: number;
  onSelectSuggestion?: (suggestion: TextFieldSuggestion) => void;
  showReportMissing?: boolean;
  onReportMissing?: () => void;
  reportMissingPrompt?: string;
  reportMissingLabel?: string;
}

function renderHighlightedTitle(title: string, query: string): ReactNode {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return title;
  }

  const lowerTitle = title.toLowerCase();
  const lowerQuery = cleanQuery.toLowerCase();
  const matchIdx = lowerTitle.indexOf(lowerQuery);

  if (matchIdx === -1) {
    return title;
  }

  const before = title.slice(0, matchIdx);
  const match = title.slice(matchIdx, matchIdx + cleanQuery.length);
  const after = title.slice(matchIdx + cleanQuery.length);

  return (
    <>
      {before}
      <mark className="bg-transparent text-inherit underline decoration-marker decoration-[3px]">
        {match}
      </mark>
      {after}
    </>
  );
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    variant = 'text',
    label,
    hint,
    error,
    loading = false,
    clearable,
    onClear,
    onValueChange,
    visualState = 'default',
    suggestions,
    selectedSuggestionIndex = 0,
    onSelectSuggestion,
    showReportMissing = false,
    onReportMissing,
    reportMissingPrompt = 'Не нашли место?',
    reportMissingLabel = 'Сообщить',
    id: providedId,
    value,
    defaultValue,
    onChange,
    onKeyDown,
    placeholder,
    disabled = false,
    className,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = providedId ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedSuggestionIndex);

  const stringValue =
    typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : '';

  const isFocusedVisual = focused || visualState === 'focus';
  const hasError = Boolean(error);
  const showClearButton =
    !loading &&
    !disabled &&
    !hasError &&
    (clearable ??
      (variant === 'link' &&
        stringValue.length > 0 &&
        Boolean(onClear ?? onValueChange ?? onChange)));

  const resolvedPlaceholder =
    placeholder ??
    (variant === 'link'
      ? 'Вставь ссылку на ролик'
      : variant === 'search'
        ? 'Название места'
        : undefined);

  const resolvedAriaLabel =
    ariaLabel ??
    (typeof label === 'string'
      ? label
      : variant === 'search'
        ? 'Название места'
        : variant === 'link'
          ? 'Ссылка на ролик'
          : undefined);

  const autoSearchSingleCharHint =
    variant === 'search' &&
    !hasError &&
    hint === undefined &&
    stringValue.trim().length === 1 &&
    (!suggestions || suggestions.length === 0)
      ? 'Набери ещё букву'
      : undefined;

  const effectiveHint = hint ?? autoSearchSingleCharHint;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onValueChange?.(event.target.value);
    setActiveIndex(0);
  };

  const handleClear = () => {
    onClear?.();
    onValueChange?.('');
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === 'Enter') {
        const current = suggestions[activeIndex];
        if (current && onSelectSuggestion) {
          event.preventDefault();
          onSelectSuggestion(current);
        }
      }
    }
    onKeyDown?.(event);
  };

  const describedBy =
    [hasError ? errorId : null, effectiveHint ? hintId : null].filter(Boolean).join(' ') ||
    undefined;

  const showSuggestionsBox =
    variant === 'search' &&
    suggestions !== undefined &&
    (suggestions.length > 0 || showReportMissing || Boolean(onReportMissing));

  return (
    <div className={clsx('flex w-full flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="font-ui text-sm leading-5 font-semibold text-ink">
          {label}
        </label>
      )}

      <div
        className={clsx(
          'box-border flex min-h-[52px] items-center gap-2.5 rounded-md border-ink bg-surface px-3.5 transition-colors duration-150 ease-out',
          hasError
            ? 'border-[2.5px]'
            : isFocusedVisual
              ? 'border-[2px] outline-[2.5px] outline-offset-[3px] outline-ink'
              : 'border-[1.5px]',
          disabled && 'border-line bg-line opacity-70',
        )}
      >
        {variant === 'link' && (
          <Link2
            size={20}
            strokeWidth={2}
            aria-hidden="true"
            className={clsx(
              'shrink-0',
              isFocusedVisual || stringValue.length > 0 ? 'text-ink' : 'text-ink-muted',
            )}
          />
        )}
        {variant === 'search' && (
          <Search size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink" />
        )}

        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          placeholder={resolvedPlaceholder}
          aria-label={resolvedAriaLabel}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-ui text-base leading-6 font-normal text-ink placeholder:text-ink-muted focus:outline-none"
          {...rest}
        />

        {showClearButton && (
          <button
            type="button"
            aria-label="Очистить"
            onClick={handleClear}
            className="-mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent text-ink transition-colors duration-150 ease-out hover:bg-line focus-visible:outline-[2.5px] focus-visible:outline-ink"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        )}

        {loading && <LoadingDots compact className="scale-60 text-ink-muted" />}
      </div>

      {showSuggestionsBox && (
        <div
          role="listbox"
          aria-label="Подсказки"
          className="overflow-hidden rounded-md border-[1.5px] border-ink bg-surface"
        >
          {suggestions.map((item, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => {
                  setActiveIndex(idx);
                  onSelectSuggestion?.(item);
                }}
                className={clsx(
                  'flex cursor-pointer flex-col gap-0.5 px-3.5 py-3 transition-colors duration-150 ease-out',
                  idx > 0 && 'border-t-[1.5px] border-line',
                  isSelected ? 'bg-line' : 'bg-surface hover:bg-line/50',
                )}
              >
                <span className="font-ui text-base font-semibold text-ink">
                  {renderHighlightedTitle(item.title, stringValue)}
                </span>
                {item.subtitle && (
                  <span className="font-ui text-sm leading-5 text-ink-muted">
                    {renderWithMonoDigits(item.subtitle)}
                  </span>
                )}
              </div>
            );
          })}

          {(showReportMissing || Boolean(onReportMissing)) && (
            <div
              className={clsx(
                'flex items-center justify-between py-1.5 pr-1.5 pl-3.5',
                suggestions.length > 0 && 'border-t-[1.5px] border-line',
              )}
            >
              <span className="font-ui text-sm text-ink-muted">{reportMissingPrompt}</span>
              <Button variant="text" onClick={onReportMissing} className="min-h-11">
                {reportMissingLabel}
              </Button>
            </div>
          )}
        </div>
      )}

      {hasError && <ErrorNote id={errorId}>{error}</ErrorNote>}

      {effectiveHint && (
        <span id={hintId} className="font-mono text-xs leading-4 text-ink-muted">
          {effectiveHint}
        </span>
      )}
    </div>
  );
});
