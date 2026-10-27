import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArrowHand, MarkerOval, Strike, Tape } from './decor';
import { MARKER_OVAL_PATHS } from './decor-paths';

describe('shared/ui/decor', () => {
  it('renders MarkerOval variants 1, 2, 3 as aria-hidden SVGs with design paths', () => {
    for (const variant of [1, 2, 3] as const) {
      const { container, unmount } = render(<MarkerOval variant={variant} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('data-variant', String(variant));

      const path = container.querySelector('path');
      expect(path).toHaveAttribute('d', MARKER_OVAL_PATHS[variant]);
      unmount();
    }
  });

  it('supports inverted MarkerOval for tomato bar stickers', () => {
    const { container } = render(<MarkerOval variant={1} inverted />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-ink');
  });

  it('renders Strike in text and sticker variants with aria-hidden', () => {
    const { container: textContainer } = render(<Strike />);
    const textSvg = textContainer.querySelector('svg');
    expect(textSvg).toHaveAttribute('aria-hidden', 'true');
    expect(textSvg).toHaveAttribute('data-variant', 'text');
    expect(textContainer.querySelectorAll('path')).toHaveLength(1);

    const { container: stickerContainer } = render(<Strike variant="sticker" inverted />);
    const stickerSvg = stickerContainer.querySelector('svg');
    expect(stickerSvg).toHaveAttribute('aria-hidden', 'true');
    expect(stickerSvg).toHaveAttribute('data-variant', 'sticker');
    expect(stickerSvg).toHaveAttribute('data-inverted', 'true');
    expect(stickerContainer.querySelectorAll('path')).toHaveLength(2);
  });

  it('renders ArrowHand and Tape with aria-hidden', () => {
    const { container: arrowContainer } = render(<ArrowHand />);
    const arrowSvg = arrowContainer.querySelector('svg');
    expect(arrowSvg).toHaveAttribute('aria-hidden', 'true');
    expect(arrowSvg).toHaveAttribute('data-decor', 'arrow-hand');
    expect(arrowContainer.querySelectorAll('path')).toHaveLength(2);

    const { container: tapeContainer } = render(<Tape />);
    const tapeSvg = tapeContainer.querySelector('svg');
    expect(tapeSvg).toHaveAttribute('aria-hidden', 'true');
    expect(tapeSvg).toHaveAttribute('data-decor', 'tape');
    expect(tapeContainer.querySelector('polygon')).toBeInTheDocument();
  });
});
