import type { Place } from '@where-is-hype/core';

export const placesFixture: Place[] = [
  {
    id: 'pokrovka-coffee',
    name: 'Кофейня во дворе',
    type: 'coffee',
    address: 'ул. Покровка, 17',
    metro: { name: 'Чистые пруды', distanceM: 450 },
    location: { lat: 55.7593, lng: 37.6478 },
    hours: null,
    avgCheck: 600,
    yandexOrgId: null,
  },
  {
    id: 'pokrovka-bar',
    name: 'Бар с винилом',
    type: 'bar',
    address: 'Потаповский пер., 5',
    metro: { name: 'Чистые пруды', distanceM: 350 },
    location: { lat: 55.7604, lng: 37.6452 },
    hours: null,
    avgCheck: 1500,
    yandexOrgId: null,
  },
];
