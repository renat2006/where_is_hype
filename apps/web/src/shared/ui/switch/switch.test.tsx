import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  it('toggles state on click and exposes role="switch" and aria-checked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <Switch checked={false} onChange={onChange} label="До 1 км от метро" />,
    );

    const switchEl = screen.getByRole('switch', { name: /До 1 км от метро/ });
    expect(switchEl).toHaveAttribute('aria-checked', 'false');

    await user.click(switchEl);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked={true} onChange={onChange} label="До 1 км от метро" />);
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });
});
