import { z } from 'zod';

const EARTH_RADIUS_M = 6_371_000;
const NBSP = '\u00A0';

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const metroStationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  location: locationSchema,
});

export type Location = z.infer<typeof locationSchema>;
export type Coordinates = Location;
export type MetroStation = z.infer<typeof metroStationSchema>;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceM(a: Location, b: Location): number {
  if (a.lat === b.lat && a.lng === b.lng) {
    return 0;
  }

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));

  return Math.round(EARTH_RADIUS_M * c);
}

export function formatDistance(m: number): string {
  const roundedMeters = Math.round(Math.max(0, m));
  if (roundedMeters < 1000) {
    return `${String(roundedMeters)}${NBSP}м`;
  }

  const km = (roundedMeters / 1000).toFixed(1).replace('.', ',');
  return `${km}${NBSP}км`;
}

function station(id: string, name: string, lat: number, lng: number): MetroStation {
  return {
    id,
    name,
    lat,
    lng,
    location: { lat, lng },
  };
}

export const metroStations: readonly MetroStation[] = [
  station('chistye-prudy', 'Чистые пруды', 55.7649, 37.6389),
  station('kitay-gorod', 'Китай-город', 55.7543, 37.6339),
  station('tverskaya', 'Тверская', 55.7653, 37.6039),
  station('arbatskaya', 'Арбатская', 55.7523, 37.6015),
  station('novokuznetskaya', 'Новокузнецкая', 55.7424, 37.629),
  station('okhotny-ryad', 'Охотный Ряд', 55.7572, 37.6151),
  station('pushkinskaya', 'Пушкинская', 55.7656, 37.6042),
  station('chekhovskaya', 'Чеховская', 55.7659, 37.6082),
  station('kuznetsky-most', 'Кузнецкий Мост', 55.7615, 37.6245),
  station('lubyanka', 'Лубянка', 55.7597, 37.6254),
  station('teatralnaya', 'Театральная', 55.7586, 37.6177),
  station('ploshchad-revolyutsii', 'Площадь Революции', 55.7567, 37.6227),
  station('biblioteka-imeni-lenina', 'Библиотека имени Ленина', 55.7521, 37.6104),
  station('aleksandrovsky-sad', 'Александровский сад', 55.7523, 37.6085),
  station('borovitskaya', 'Боровицкая', 55.7505, 37.6091),
  station('kropotkinskaya', 'Кропоткинская', 55.7451, 37.6036),
  station('tretyakovskaya', 'Третьяковская', 55.7408, 37.6256),
  station('polyanka', 'Полянка', 55.7368, 37.6186),
  station('trubnaya', 'Трубная', 55.7677, 37.6219),
  station('tsvetnoy-bulvar', 'Цветной бульвар', 55.7716, 37.6206),
  station('turgenevskaya', 'Тургеневская', 55.7646, 37.6367),
  station('sretensky-bulvar', 'Сретенский бульвар', 55.7658, 37.6357),
  station('mayakovskaya', 'Маяковская', 55.7698, 37.5962),
  station('sukharevskaya', 'Сухаревская', 55.7723, 37.6324),
  station('krasnye-vorota', 'Красные Ворота', 55.7691, 37.6499),
  station('kurskaya', 'Курская', 55.7585, 37.659),
  station('chkalovskaya', 'Чкаловская', 55.7562, 37.6594),
  station('taganskaya', 'Таганская', 55.7425, 37.6533),
  station('marksistskaya', 'Марксистская', 55.741, 37.6562),
  station('paveletskaya', 'Павелецкая', 55.7313, 37.6361),
  station('dobryninskaya', 'Добрынинская', 55.7289, 37.6226),
  station('serpukhovskaya', 'Серпуховская', 55.7266, 37.6247),
  station('oktyabrskaya', 'Октябрьская', 55.7312, 37.6128),
  station('park-kultury', 'Парк культуры', 55.7352, 37.593),
  station('smolenskaya', 'Смоленская', 55.7477, 37.5838),
  station('barrikadnaya', 'Баррикадная', 55.7607, 37.5811),
];
