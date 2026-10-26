import type { NoiseLevel, Place } from '@where-is-hype/core';

const noiseLabel: Record<NoiseLevel, string> = {
  quiet: 'Тихо',
  moderate: 'Умеренно',
  loud: 'Громко',
};

interface PlaceCardProps {
  place: Place;
}

export function PlaceCard({ place }: PlaceCardProps) {
  return (
    <article className="rounded-2xl bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">{place.name}</h2>
      <p className="text-sm text-muted">{place.address}</p>
      <p className="mt-2 text-sm">{noiseLabel[place.noiseLevel]}</p>
    </article>
  );
}
