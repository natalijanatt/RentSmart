const EARTH_RADIUS_M = 6_371_000;

/**
 * Returns the great-circle distance in metres between two GPS coordinates.
 * Uses the Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Maximum allowed distance (metres) between property GPS and inspection GPS. */
export const GPS_MAX_DISTANCE_M = 200;
