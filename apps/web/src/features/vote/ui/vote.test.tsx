import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { VoteButton } from './vote-button';
import { VoterNameField } from './voter-name-field';

describe('VoteButton and VoterNameField UI', () => {
  it('renders "Мне подходит" when unselected, "Подходит" when selected, and "Голосование закрыто" when disabled', () => {
    const onToggle = vi.fn();
    const votes = [{ voterId: 'v-1', name: 'Катя', placeIds: ['sosny'] }];

    const { rerender } = render(
      <VoteButton placeId="sosny" votes={votes} selected={false} onToggle={onToggle} />,
    );

    const button = screen.getByTestId('vote-button-sosny');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Мне подходит');
    expect(button).toHaveTextContent('1');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith('sosny');

    rerender(<VoteButton placeId="sosny" votes={votes} selected={true} onToggle={onToggle} />);
    expect(screen.getByTestId('vote-button-sosny')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('vote-button-sosny')).toHaveTextContent('Подходит');

    rerender(<VoteButton placeId="sosny" votes={votes} selected={false} disabled />);
    expect(screen.getByTestId('vote-button-sosny')).toBeDisabled();
    expect(screen.getByTestId('vote-button-sosny')).toHaveTextContent('Голосование закрыто');
  });

  it('renders VoterNameField and calls onValueChange and onCommit on blur', () => {
    const onCommit = vi.fn();

    function ControlledField() {
      const [name, setName] = useState('');
      return <VoterNameField value={name} onValueChange={setName} onCommit={onCommit} />;
    }

    render(<ControlledField />);

    const input = screen.getByTestId('voter-name-input');
    expect(input).toHaveAttribute('placeholder', 'Как тебя подписать? Необязательно');

    fireEvent.change(input, { target: { value: 'Маша' } });
    expect(input).toHaveValue('Маша');

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Маша');
  });
});
