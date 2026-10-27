import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OfflineBanner } from './offline-banner';

describe('OfflineBanner', () => {
  it('renders offline and slow network banner variants', () => {
    const { rerender } = render(<OfflineBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Нет сети.');
    expect(banner).toHaveTextContent('Показываем сохранённое');

    rerender(<OfflineBanner variant="slow" />);
    expect(banner).toHaveTextContent('Сеть медленная.');
    expect(banner).toHaveTextContent('Карта догрузится');
  });
});
