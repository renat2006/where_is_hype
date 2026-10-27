import type { InputHTMLAttributes, KeyboardEvent } from 'react';

import { MAX_VOTER_NAME_LENGTH } from '@/features/vote/model/vote-model';
import { TextField } from '@/shared/ui/text-field';

export interface VoterNameFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'value' | 'onChange'
> {
  value: string;
  onValueChange: (value: string) => void;
  onCommit?: ((value: string) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function VoterNameField({
  value,
  onValueChange,
  onCommit,
  disabled = false,
  className,
  onBlur,
  onKeyDown,
  ...rest
}: VoterNameFieldProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      onCommit?.(value);
    }
    onKeyDown?.(event);
  };

  return (
    <TextField
      variant="text"
      label={
        <>
          Как тебя подписать? <span className="font-normal text-ink-muted">необязательно</span>
        </>
      }
      aria-label="Как тебя подписать (необязательно)"
      placeholder="Как тебя подписать? Необязательно"
      maxLength={MAX_VOTER_NAME_LENGTH}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      onBlurCapture={(event) => {
        onBlur?.(event);
        onCommit?.(value);
      }}
      onKeyDown={handleKeyDown}
      data-testid="voter-name-input"
      className={className}
      {...rest}
    />
  );
}
