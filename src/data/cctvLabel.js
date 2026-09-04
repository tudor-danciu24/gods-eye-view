/**
 * @file CCTV in-world label composition.
 *
 * The detection overlay draws a camera's label from the `id` field returned by
 * `getDetectableObjects()`, which used to be the raw record id — an in-world
 * `CAM-windy-1793907437` that told an operator nothing. This composes a place
 * name instead.
 *
 * The hard constraint is width: `detectionDraw.js` truncates the primary line
 * at 18 characters, so a full Windy title ("Bucharest › South-east: Piața
 * Unirii - Bulevardul Unirii") cannot be shown and a naive slice would read
 * "Bucharest › South". The most specific component that fits is the place, and
 * the place is also what a city name cannot give you — every camera in the same
 * city would otherwise carry an identical label.
 *
 * Cesium-free and DOM-free so it can be unit tested directly.
 */

/**
 * Compass bearings Windy interleaves into titles as their own segment.
 * A bearing describes which way the camera points, which the orientation arrow
 * already shows in world space — as label text it is pure noise, and it is what
 * left "Ploiesti: Centru › North-east" reading as a direction rather than a place.
 */
const BEARING_SEGMENT = /^(north|south|east|west)([\s-](east|west))?$/i;

/**
 * Compose the in-world location label for a camera.
 *
 * Windy titles are a `:`/`›`-separated path that widens from city to place —
 * "Bucharest › South-east: Piața Unirii", "Vaslui: Crucea Gării", "Riscani".
 * Splitting on both separators and dropping bearing segments leaves the most
 * specific place as the last element, which is the one an operator recognises.
 *
 * Every step degrades rather than failing: a title with no separators is used
 * whole, and a camera with no usable title falls back to its city and finally
 * to its id, so a valid camera never draws a blank label.
 *
 * @param {object} camera
 * @param {string} [camera.name] - Provider title.
 * @param {string} [camera.city] - "City, Country" as composed by the loader.
 * @param {string} [camera.id]   - Last-resort fallback.
 * @returns {string} A place label, never empty for a camera with any identity.
 */
export function cctvLocationLabel({ name = '', city = '', id = '' } = {}) {
  const title = String(name || '').trim();

  const segments = title
    .split(/[:›]/)
    .map((part) => part.trim())
    .filter((part) => part && !BEARING_SEGMENT.test(part));

  // The last surviving segment is the most specific place in the path.
  let place = segments.length ? segments[segments.length - 1] : '';

  // "Piața Unirii - Bulevardul Unirii" → "Piața Unirii". The first component is
  // the landmark; the second is usually the street it sits on, which is what
  // overflows the character budget.
  const dash = place.indexOf(' - ');
  if (dash > 0) place = place.slice(0, dash).trim();

  if (place) return place;

  // No usable title: the city still locates the camera better than its id.
  const cityName = String(city || '').split(',')[0].trim();
  if (cityName) return cityName;

  return String(id || '');
}
