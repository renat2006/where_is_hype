import type { Place } from '@where-is-hype/core';

export const placesFixture: Place[] = [
  {
    id: 'pokrovka-coffee',
    name: 'Кофейня во дворе',
    address: 'ул. Покровка, 17',
    location: { lat: 55.7593, lng: 37.6478 },
    noiseLevel: 'quiet',
    entrancePhotoUrl: null,
  },
  {
    id: 'pokrovka-bar',
    name: 'Бар с винилом',
    address: 'Потаповский пер., 5',
    location: { lat: 55.7604, lng: 37.6452 },
    noiseLevel: 'loud',
    entrancePhotoUrl: null,
  },
];
