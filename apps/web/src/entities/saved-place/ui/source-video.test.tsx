import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SourceVideo } from './source-video';

describe('SourceVideo', () => {
  it('renders platform name, external link, and decorative tape', () => {
    const { container } = render(
      <SourceVideo sourceUrl="https://vt.tiktok.com/ZS8kQ2pLm" platform="tiktok" />,
    );

    expect(screen.getByTestId('source-video-platform')).toHaveTextContent(
      'Исходный ролик · TikTok',
    );

    const link = screen.getByRole('link', { name: 'vt.tiktok.com/ZS8kQ2pLm' });
    expect(link).toHaveAttribute('href', 'https://vt.tiktok.com/ZS8kQ2pLm');
    expect(container.querySelector('[data-decor="tape"]')).toBeInTheDocument();
  });

  it('auto-detects platform from URL and handles empty state when sourceUrl is null', () => {
    const { rerender, container } = render(
      <SourceVideo sourceUrl="https://www.instagram.com/reel/C9xQ/" showTape={false} />,
    );

    expect(screen.getByTestId('source-video-platform')).toHaveTextContent(
      'Исходный ролик · Instagram',
    );
    expect(container.querySelector('[data-decor="tape"]')).not.toBeInTheDocument();

    rerender(<SourceVideo sourceUrl={null} />);
    expect(screen.getByText('Добавлено без ссылки')).toBeInTheDocument();

    rerender(<SourceVideo sourceUrl={null} hideIfEmpty />);
    expect(container).toBeEmptyDOMElement();
  });
});
