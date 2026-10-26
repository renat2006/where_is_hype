export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError('Distance must be a non-negative finite number');
  }

  const roundedMeters = Math.round(meters);

  if (roundedMeters < 1000) {
    return `${String(roundedMeters)} м`;
  }

  const kilometers = (meters / 1000).toFixed(1).replace('.', ',');

  return `${kilometers} км`;
}
