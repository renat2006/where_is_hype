import type { Place } from '@where-is-hype/core';
import { placeTypeLabel } from '@where-is-hype/core';

interface PlaceCardProps {
  place: Place;
}

export function PlaceCard({ place }: PlaceCardProps) {
  return (
    <article className="rounded-2xl bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">{place.name}</h2>
      <p className="text-sm text-muted">{place.address}</p>
      <p className="mt-2 text-sm">{placeTypeLabel[place.type]}</p>
    </article>
  );
}
