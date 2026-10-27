import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo, LogoCompact, LogoLockup, LogoMark } from './logo';

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../../public');

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('shared/ui/logo', () => {
  it('renders LogoLockup with "Где Хайп" text and rotated "?" sticker mark without doubling the question mark', () => {
    render(<LogoLockup size="lg" />);

    const lockup = screen.getByRole('img', { name: 'Где Хайп?' });
    expect(lockup).toBeInTheDocument();
    expect(lockup).toHaveAttribute('data-logo-variant', 'lockup');
    expect(lockup).toHaveTextContent('Где Хайп?');

    const mark = lockup.querySelector('[data-logo-variant="mark"]');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({ transform: 'rotate(-4deg)' });
  });

  it('renders LogoCompact with marker-colored question mark and optional map pill', () => {
    const { rerender } = render(<LogoCompact />);

    const compact = screen.getByRole('img', { name: 'Где Хайп?' });
    expect(compact).toHaveAttribute('data-logo-variant', 'compact');
    expect(compact).toHaveTextContent('Где Хайп?');
    expect(compact.querySelector('.text-marker')).toHaveTextContent('?');

    rerender(<LogoCompact pill />);
    expect(screen.getByRole('img', { name: 'Где Хайп?' })).toHaveClass('rounded-pill');
  });

  it('renders standalone LogoMark rotated -4deg and unified Logo component', () => {
    const { rerender } = render(<LogoMark size="sm" />);

    const mark = screen.getByRole('img', { name: 'Где Хайп?' });
    expect(mark).toHaveAttribute('data-logo-variant', 'mark');
    expect(mark).toHaveStyle({ transform: 'rotate(-4deg)' });

    rerender(<Logo variant="compact" />);
    expect(screen.getByRole('img', { name: 'Где Хайп?' })).toHaveAttribute(
      'data-logo-variant',
      'compact',
    );
  });

  it('provides favicon.svg with dark tab support and PWA / Apple Touch icons in public/', () => {
    const faviconPath = resolve(PUBLIC_DIR, 'favicon.svg');
    expect(existsSync(faviconPath)).toBe(true);
    const faviconContent = readFileSync(faviconPath, 'utf8');
    expect(faviconContent).toContain('prefers-color-scheme: dark');
    expect(faviconContent).toContain('#FF4A1C');
    expect(faviconContent).toContain('#FF6A3D');
    expect(faviconContent).toContain('rotate(-4');

    expect(existsSync(resolve(PUBLIC_DIR, 'icon-mono.svg'))).toBe(true);

    expect(readPngDimensions(resolve(PUBLIC_DIR, 'icon-180.png'))).toEqual({
      width: 180,
      height: 180,
    });
    expect(readPngDimensions(resolve(PUBLIC_DIR, 'apple-touch-icon.png'))).toEqual({
      width: 180,
      height: 180,
    });
    expect(readPngDimensions(resolve(PUBLIC_DIR, 'icon-192.png'))).toEqual({
      width: 192,
      height: 192,
    });
    expect(readPngDimensions(resolve(PUBLIC_DIR, 'icon-512.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(readPngDimensions(resolve(PUBLIC_DIR, 'icon-512-maskable.png'))).toEqual({
      width: 512,
      height: 512,
    });
  });
});
