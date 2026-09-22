/** Radius value meaning "no limit" — every open shop, nearest first. */
export const ANY_DISTANCE = 0;

export const RADIUS_OPTIONS = [1000, 3000, 5000, 10000, 25000, ANY_DISTANCE];

export function radiusLabel(radiusM: number): string {
  return radiusM === ANY_DISTANCE ? "Any distance" : `${radiusM / 1000} km`;
}
