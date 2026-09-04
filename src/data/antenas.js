/**
 * @file Antenas — layer skeleton.
 *
 * SKELETON: registered, toggleable, and wired end to end, but it renders
 * nothing because no upstream source is chosen yet. `/api/antenas` answers with
 * an empty set by design (see `antenasProxy` in vite.config.js), so the layer
 * reports a truthful "0 antenas" rather than a green ON over an empty globe.
 *
 * What is deliberately already correct, so populating it later is only a
 * matter of filling in the proxy and the draw call:
 *
 *  - **The presentation gate is respected.** Nothing is added to the scene
 *    until `enable()` has run; `update()` returns early while disabled, so a
 *    fetch in flight when the user toggles off cannot draw into a hidden scene.
 *  - **No per-frame cost.** There is no CallbackProperty and no render-governor
 *    hold. Discrete changes call `governorRequestRender()`; without that call a
 *    scene mutation simply never appears (see renderGovernor.js).
 *  - **Failure degrades.** A bad response leaves the previous entities alone and
 *    surfaces `error` through `getStats()`, which is what turns the layer chip
 *    into an honest UNAVAILABLE instead of a silent lie.
 *
 * Pure parsing lives in the Cesium-free `antenasParse.js`, imported by BOTH
 * this module and the proxy. Keep decisions there and rendering here.
 */
import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { parseAntenasPayload } from './antenasParse.js';

const ENDPOINT = '/api/antenas';
/** Catalogue-style source: slow cadence until the real upstream says otherwise. */
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
/** Bounds a hung upstream so update() cannot stay pending forever. */
const FETCH_TIMEOUT_MS = 15 * 1000;

/** @type {Cesium.CustomDataSource|null} */
let _dataSource = null;
let _enabled = false;
let _count = 0;
let _lastUpdate = null;
/** @type {string|null} Surfaced through getStats() so the chip can say UNAVAILABLE. */
let _lastError = null;

/**
 * Fetch and parse the current antena set.
 * Never throws: callers get [] and the error is recorded for getStats().
 *
 * @returns {Promise<import('./antenasParse.js').AntenaRecord[]>}
 */
async function loadAntenas() {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      _lastError = `Antenas upstream HTTP ${response.status}`;
      return [];
    }
    const payload = await response.json();
    _lastError = null;
    return parseAntenasPayload(payload);
  } catch (error) {
    _lastError = error?.message || 'Antenas fetch failed';
    return [];
  }
}

const antenasLayer = {
  id: 'antenas',
  name: 'Antenas',
  icon: '📡',
  source: 'TBD',
  updateInterval: UPDATE_INTERVAL_MS,

  /**
   * Creates the (hidden) data source. Nothing is drawn here — the manager has
   * not settled yet, and drawing before `enable()` is what the presentation
   * gate exists to prevent.
   * @param {Cesium.Viewer} viewer
   * @returns {void}
   */
  init(viewer) {
    if (!viewer) return;
    if (!_dataSource) {
      _dataSource = new Cesium.CustomDataSource('antenas');
      viewer.dataSources.add(_dataSource);
    }
    _dataSource.show = false;
    _enabled = false;
  },

  /**
   * @param {Cesium.Viewer} _viewer
   * @returns {void}
   */
  enable(_viewer) {
    _enabled = true;
    if (_dataSource) _dataSource.show = true;
    governorRequestRender();
  },

  /**
   * @param {Cesium.Viewer} _viewer
   * @returns {void}
   */
  disable(_viewer) {
    _enabled = false;
    if (_dataSource) _dataSource.show = false;
    governorRequestRender();
  },

  /**
   * Refreshes the antena set.
   *
   * TODO(populate): draw the records. Prefer a BillboardCollection over one
   * entity per record if the count goes past a few hundred, and register it
   * with `registerSpriteCollection('antenas', collection)` from spriteOrder.js
   * so compositing order stays deterministic — the 'antenas' slot is already
   * reserved there.
   *
   * @param {Cesium.Viewer} _viewer
   * @returns {Promise<void>}
   */
  async update(_viewer) {
    if (!_enabled || !_dataSource) return;

    const records = await loadAntenas();
    // Re-check after the await: the user may have toggled the layer off while
    // the request was in flight, and a late draw would populate a hidden scene.
    if (!_enabled || !_dataSource) return;

    // A failed refresh keeps the last good set on screen rather than blanking
    // the layer; getStats() is what reports the staleness.
    if (_lastError && records.length === 0) {
      _lastUpdate = Date.now();
      return;
    }

    _dataSource.entities.removeAll();
    for (const _record of records) {
      // TODO(populate): add the entity/billboard for this record.
    }
    _count = records.length;
    _lastUpdate = Date.now();
    governorRequestRender();
  },

  /**
   * Full teardown. Called on layer removal and viewer disposal.
   * @param {Cesium.Viewer} viewer
   * @returns {void}
   */
  destroy(viewer) {
    if (_dataSource) {
      _dataSource.entities.removeAll();
      viewer?.dataSources?.remove(_dataSource, true);
      _dataSource = null;
    }
    _enabled = false;
    _count = 0;
    _lastUpdate = null;
    _lastError = null;
  },

  /**
   * Feed-health report. `error` is non-null whenever the last refresh failed,
   * which is what the layer chip needs to show UNAVAILABLE instead of green.
   * @returns {{count:number, lastUpdate:number|null, error:string|null}}
   */
  getStats() {
    return {
      count: _count,
      lastUpdate: _lastUpdate,
      error: _lastError,
    };
  },
};

export default antenasLayer;
