import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetroStation, MyLocationDot, Sticker, StickerCluster } from './sticker';
import { getStickerTilt, STICKER_TILT_ANGLES } from './sticker-tilt';

describe('shared/ui/sticker', () => {
  describe('getStickerTilt and tilt prop', () => {
    it('returns a deterministic non-zero angle within ±4° for the same id', () => {
      const sampleIds = [
        'pokrovka-coffee',
        'pokrovka-bar',
        'sosny',
        'zhuk-i-pchela',
        'zhuravli',
        'myata-na-kryshe',
        'zerno',
        'okna-vo-dvor',
      ];

      for (const id of sampleIds) {
        const first = getStickerTilt(id);
        const second = getStickerTilt(id);
        expect(first).toBe(second);
        expect(STICKER_TILT_ANGLES).toContain(first);
        expect(Math.abs(first)).toBeLessThanOrEqual(4);
        expect(Math.abs(first)).toBeGreaterThanOrEqual(2);
      }

      const distinctAngles = new Set(sampleIds.map((id) => getStickerTilt(id)));
      expect(distinctAngles.size).toBeGreaterThan(2);
    });

    it('keeps tilt disabled by default (list/card mode) and applies deterministic rotation when tilt is enabled', () => {
      const { rerender } = render(<Sticker type="coffee" placeId="pokrovka-coffee" />);

      const sticker = screen.getByRole('img', { name: 'Кофейня' });
      expect(sticker).toHaveAttribute('data-tilt', '0');
      const circle = sticker.querySelector('[data-sticker-circle="true"]');
      expect(circle).not.toHaveAttribute('style');

      const expectedAngle = getStickerTilt('pokrovka-coffee');
      rerender(<Sticker type="coffee" placeId="pokrovka-coffee" tilt />);

      expect(sticker).toHaveAttribute('data-tilt', String(expectedAngle));
      expect(circle).toHaveStyle({ transform: `rotate(${String(expectedAngle)}deg)` });
    });
  });

  describe('screen reader labels and states', () => {
    it('provides accessible labels for all place types and states', () => {
      const { rerender } = render(<Sticker type="coffee" state="default" />);
      expect(screen.getByRole('img', { name: 'Кофейня' })).toBeInTheDocument();

      rerender(<Sticker type="cafe" state="selected" />);
      const selectedSticker = screen.getByRole('img', { name: 'Кафе, выбрано' });
      expect(selectedSticker).toBeInTheDocument();
      expect(selectedSticker.querySelector('[data-decor="marker-oval"]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );

      rerender(<Sticker type="rest" state="visited" name="Сосны" />);
      const visitedSticker = screen.getByRole('img', { name: 'Сосны, Ресторан, был здесь' });
      expect(visitedSticker).toBeInTheDocument();
      expect(visitedSticker.querySelector('[data-decor="strike"]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );

      rerender(<Sticker type="bar" state="unknown" />);
      expect(screen.getByRole('img', { name: 'Бар, не уточнено' })).toBeInTheDocument();

      rerender(<Sticker type="coffee" inEvening />);
      const eveningSticker = screen.getByRole('img', { name: 'Кофейня, в «На вечер»' });
      expect(eveningSticker).toBeInTheDocument();
      expect(eveningSticker.querySelector('[data-sticker-flag="true"]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it('inverts selection oval and strike on bar sticker', () => {
      const { rerender } = render(<Sticker type="bar" state="selected" />);
      const barSelected = screen.getByRole('img', { name: 'Бар, выбрано' });
      expect(barSelected.querySelector('[data-decor="marker-oval"]')).toHaveClass('text-ink');

      rerender(<Sticker type="bar" state="visited" />);
      const barVisited = screen.getByRole('img', { name: 'Бар, был здесь' });
      expect(barVisited.querySelector('[data-decor="strike"]')).toHaveAttribute(
        'data-inverted',
        'true',
      );
    });
  });

  describe('map elements: cluster, my location, metro', () => {
    it('renders StickerCluster with mono count and 40+ cap', () => {
      const { rerender } = render(<StickerCluster count={12} />);
      const cluster = screen.getByRole('img', { name: 'Кластер: 12 мест' });
      expect(cluster).toHaveTextContent('12');
      expect(cluster.querySelector('.font-mono')).toHaveTextContent('12');

      rerender(<StickerCluster count={45} />);
      const overflowCluster = screen.getByRole('img', { name: 'Кластер: 40+ мест' });
      expect(overflowCluster).toHaveTextContent('40+');
    });

    it('renders MyLocationDot and MetroStation with screen reader labels', () => {
      render(
        <>
          <MyLocationDot />
          <MetroStation name="Чистые пруды" variant="origin" />
          <MetroStation variant="map" />
        </>,
      );

      expect(screen.getByRole('img', { name: 'Моя точка' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Станция метро Чистые пруды' })).toHaveTextContent(
        'Чистые пруды',
      );
      expect(screen.getByRole('img', { name: 'Станция метро' })).toBeInTheDocument();
    });
  });
});
