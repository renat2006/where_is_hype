import { useQuery } from '@tanstack/react-query';

import { PlaceCard, placeQueries } from '@/entities/place';

export function HomePage() {
  const { data: places, isPending, isError } = useQuery(placeQueries.list());

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-display text-2xl font-bold">Мои места</h1>
      {isPending && <p className="text-muted">Загружаем места…</p>}
      {isError && <p className="text-hot">Не получилось загрузить места</p>}
      {places?.map((place) => (
        <PlaceCard key={place.id} place={place} />
      ))}
    </main>
  );
}
