/**
 * @file Antenas — pure parsing and validation, shared by the proxy and the layer.
 *
 * SKELETON. The upstream source is not chosen yet, so this module defines the
 * record shape the rest of the layer is written against and nothing more. When
 * the real source lands, adapt `parseAntenasPayload` to it and leave everything
 * downstream alone — that is the point of the split.
 *
 * Cesium-free and Node-free by contract: `vite.config.js` imports this module
 * server-side and `antenas.js` imports it in the browser.
 * `browserModuleBoundary.test.mjs` enforces the boundary, so do not reach for
 * `fs`, `process`, `window`, or `cesium` here.
 */

/**
 * @typedef {object} AntenaRecord
 * @property {string} id      - Stable upstream id. Records without one are dropped.
 * @property {number} lat     - WGS-84 latitude, degrees.
 * @property {number} lon     - WGS-84 longitude, degrees.
 * @property {string} name    - Display label; falls back to the id.
 * @property {number} heightM - Structure height in metres, or NaN when unpublished.
 */

/** Upper bound on records the layer will hold. Keeps a runaway upstream bounded. */
export const ANTENAS_MAX_RECORDS = 2000;

/**
 * Coerce a coordinate field.
 *
 * NOT a bare `Number()`: `Number(null)` is 0, so a record with a null latitude
 * would coerce to a finite 0 and place an antenna in the Gulf of Guinea instead
 * of being dropped. Absent coordinates must read as absent.
 *
 * @param {*} value
 * @returns {number} The coordinate, or NaN when absent/unparseable.
 */
export function readCoord(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Normalize one raw upstream row into an {@link AntenaRecord}.
 * Returns null for anything that cannot be rendered honestly.
 *
 * @param {object} raw
 * @returns {AntenaRecord|null}
 */
export function normalizeAntena(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  if (!id) return null;

  const lat = readCoord(raw.lat);
  const lon = readCoord(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const heightRaw = readCoord(raw.heightM);
  return {
    id,
    lat,
    lon,
    name: String(raw.name || id),
    // An unpublished height stays NaN rather than becoming 0: the renderer must
    // be able to tell "at ground level" from "we were never told".
    heightM: Number.isFinite(heightRaw) ? heightRaw : NaN,
  };
}

/**
 * Parse an upstream payload into deduplicated, bounded records.
 *
 * Never throws: a malformed upstream returns [] so the caller degrades to an
 * empty layer instead of killing the scene.
 *
 * @param {*} payload - Whatever the upstream returned (already JSON-decoded).
 * @param {object} [options]
 * @param {number} [options.max=ANTENAS_MAX_RECORDS] - Cap on returned records.
 * @returns {AntenaRecord[]}
 */
export function parseAntenasPayload(payload, { max = ANTENAS_MAX_RECORDS } = {}) {
  const rows = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.antenas) ? payload.antenas : []);

  const byId = new Map();
  for (const row of rows) {
    const record = normalizeAntena(row);
    if (!record) continue;
    byId.set(record.id, record);
    if (byId.size >= max) break;
  }
  return Array.from(byId.values());
}
