// src/data/cctv.test.mjs — CCTV v2 pure frustum geometry (computeFrustumGeometry).
//
// Locks the §2a math of docs/plans/2026-07-03-cctv-v2-design.md:
//   - the far-cap (monitor plane) corners lie ON the plane through capCenter
//     perpendicular to the frustum view axis (ε < 0.5 m) — this is the geometric
//     invariant that welds the wireframe corner rays to the plane entity;
//   - vFov = 2·atan(tan(hFov/2) / (16/9)) (same 16:9 derivation the projection
//     frame used);
//   - far-cap center + corners clamp to ≥ groundAlt + 2 m so a fabricated pitch
//     (Austin's -24°) never buries the plane in the tiles (§6 risk);
//   - the activation obstruction probe's range clamp (§9.1) shortens the
//     effective range, never lengthens it.
//
// computeFrustumGeometry is PURE (no viewer, no scene queries) so it runs under
// plain node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Cesium from 'cesium';
import cctvLayer, {
  _extractPickedCameraIdForTest,
  bindCctvWorldClickGesture,
  cctvCycleIndex,
  cctvEmptyClickDeselects,
  cctvRecordNeedsActivation,
  deactivateActiveCamera,
  CCTV_FOCUS_RESULT,
  CCTV_CALIBRATION_STORAGE_KEY_V2,
  CCTV_CALIBRATION_STORAGE_KEY_V1,
  readCalibrationStoreV2,
  writeCalibrationStoreV2,
  deriveCalBadge,
  surfaceRegimeKey,
  calibrationPatchMovesAnchor,
  cctvGeometryDrainPacing,
  createGeometryProgressNotifier,
  focusCctvRecord,
  maybeAutoHop,
  prioritizeActiveCctvGeometryRecord,
  processCctvGeometryDrainBatch,
  processCctvGeometryQueueBatch,
  processGeometryBatch,
  setActiveCamera,
} from './cctv.js';
import {
  CCTV_ACTIVATION_RESULT,
  CCTV_FOCUS_REQUEST_EVENT,
  activateCctvCameraFromWorldClick,
} from '../cctvFocusRequest.js';

const UI_SOURCE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui.js'),
  'utf8',
);

const ASPECT = 16 / 9;
const toRad = (deg) => (deg * Math.PI) / 180;
const GESTURE_TYPES = {
  LEFT_DOWN: 'left-down',
  MOUSE_MOVE: 'mouse-move',
  LEFT_UP: 'left-up',
  LEFT_CLICK: 'left-click',
};

function makeGestureHandler() {
  const actions = new Map();
  return {
    setInputAction(callback, type) { actions.set(type, callback); },
    fire(type, event) { actions.get(type)?.(event); },
  };
}
// Same spherical earth radius projectPoint uses (R = 6371 km) so the
// lat/lon→metres conversion in the assertions matches the module's math.
const M_PER_DEG = (Math.PI / 180) * 6371000;

/** Local ENU metres of point b relative to point a ({lat, lon, alt}). */
function enu(a, b) {
  return {
    e: (b.lon - a.lon) * M_PER_DEG * Math.cos(toRad(a.lat)),
    n: (b.lat - a.lat) * M_PER_DEG,
    u: b.alt - a.alt,
  };
}

function dot(v, w) {
  return v.e * w.e + v.n * w.n + v.u * w.u;
}

function sub(v, w) {
  return { e: v.e - w.e, n: v.n - w.n, u: v.u - w.u };
}

function mag(v) {
  return Math.hypot(v.e, v.n, v.u);
}

/** Unit view-axis direction for a heading/pitch pose, in ENU. */
function viewDir(headingDeg, pitchDeg) {
  const h = toRad(headingDeg);
  const p = toRad(pitchDeg);
  return { e: Math.sin(h) * Math.cos(p), n: Math.cos(h) * Math.cos(p), u: Math.sin(p) };
}

// A pose whose far cap sits well above ground (no clamping) so the raw plane
// math is observable: tall mount, shallow pitch.
const UNCLAMPED_CAMERA = {
  lat: 30.2672,
  lon: -97.7431,
  headingDeg: 41,
  pitchDeg: -5,
  fovDeg: 56,
  rangeM: 210,
  mountHeightM: 100,
};
const UNCLAMPED_GROUND = 0;

// Austin's fabricated prior personality (design §1a): pitch -24° at 210 m puts
// the unclamped cap ~85 m below the mount — underground vs groundAlt 150.
const AUSTIN_FABRICATED_CAMERA = {
  lat: 30.2672,
  lon: -97.7431,
  headingDeg: 41,
  pitchDeg: -24,
  fovDeg: 56,
  rangeM: 210,
  mountHeightM: 10,
};
const AUSTIN_GROUND = 150;

/** Minimal in-memory localStorage stand-in for pure store-IO unit tests. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    _dump: () => Object.fromEntries(map.entries()),
  };
}

test('geometry drain coalesces 40 progress ticks and always publishes the final state', () => {
  let nowMs = 0;
  const state = { loaded: 0, total: 40, loading: true };
  const coalesced = [];
  const unthrottled = [];
  let progressInvocations = 0;
  const notifier = createGeometryProgressNotifier(
    () => coalesced.push({ ...state }),
    { now: () => nowMs, intervalMs: 300, batchLimit: 10 },
  );

  const queue = Array.from({ length: state.total }, (_, index) => index + 1);
  while (queue.length) {
    processCctvGeometryQueueBatch({
      queue,
      batchSize: 1,
      visit: (loaded) => {
        state.loaded = loaded;
        nowMs += 35;
        unthrottled.push({ ...state });
      },
      progress: () => notifier.progress(),
      complete: () => {
        progressInvocations = coalesced.length;
        state.loading = false;
        notifier.finish();
      },
    });
  }

  assert.ok(
    progressInvocations >= 4 && progressInvocations <= 6,
    `expected about 4-6 progress callbacks, got ${progressInvocations}`,
  );
  assert.notEqual(progressInvocations, 40);

  assert.equal(
    coalesced.length,
    progressInvocations + 1,
    'queue completion must add one unconditional final notification',
  );
  assert.deepEqual(coalesced.at(-1), { ...unthrottled.at(-1), loading: false });

  const productionDrain = processGeometryBatch.toString();
  assert.match(productionDrain, /processCctvGeometryDrainBatch/);
  assert.match(productionDrain, /_geoProgressNotifier\?\.progress\(\)/);
  assert.match(productionDrain, /_geoProgressNotifier\?\.finish\(\)/);
  assert.doesNotMatch(productionDrain, /if \(_geoLoading\) notifyListeners\(\)/);
});

test('geometry drain pacing yields to tracked and cockpit camera ownership', () => {
  assert.deepEqual(cctvGeometryDrainPacing(), { batchSize: 4, delayMs: 120 });
  assert.deepEqual(
    cctvGeometryDrainPacing({ trackedEntity: { id: 'flight-1' } }),
    { batchSize: 2, delayMs: 250 },
  );
  assert.deepEqual(
    cctvGeometryDrainPacing({ cockpitActive: true }),
    { batchSize: 2, delayMs: 250 },
  );

  const active = { id: 'active' };
  const queue = [{ id: 'near' }, { id: 'far' }, active];
  assert.equal(prioritizeActiveCctvGeometryRecord(queue, active), true);
  assert.equal(queue[0], active);
});

test('geometry drain rechecks pacing when tracking releases between batches', () => {
  let trackedEntity = { id: 'flight-1' };
  const queue = Array.from({ length: 10 }, (_, index) => index + 1);
  const visited = [];
  const runBatch = () => processCctvGeometryDrainBatch({
    queue,
    readOwnership: () => ({ trackedEntity, cockpitActive: false }),
    visit: (record) => visited.push(record),
    progress: () => {},
    complete: () => {},
  });

  const trackedBatch = runBatch();
  assert.deepEqual(trackedBatch, { hasMore: true, batchSize: 2, delayMs: 250 });
  assert.deepEqual(visited, [1, 2]);

  trackedEntity = null;
  const untrackedBatch = runBatch();
  assert.deepEqual(untrackedBatch, { hasMore: true, batchSize: 4, delayMs: 120 });
  assert.deepEqual(visited, [1, 2, 3, 4, 5, 6]);

  assert.match(processGeometryBatch.toString(), /processCctvGeometryDrainBatch/);
});

test('CCTV focus distinguishes tracking ownership from a missing active camera', () => {
  let flyCalls = 0;
  const viewer = {
    trackedEntity: { id: 'tracked-flight' },
    camera: { heading: 0, positionCartographic: { height: 900 }, flyTo() { flyCalls += 1; } },
  };
  const record = {
    camera: { lat: 0, lon: 0, absoluteHeightM: 10, rangeM: 210, headingDeg: 41 },
    position: { x: 1, y: 2, z: 3 },
  };
  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    assert.equal(
      focusCctvRecord(viewer, record, 1.9),
      CCTV_FOCUS_RESULT.TRACKING_HOLDS_VIEW,
    );
  } finally {
    console.debug = originalDebug;
  }
  assert.equal(flyCalls, 0);
  assert.equal(
    focusCctvRecord(viewer, null, 1.9),
    CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA,
  );
});

test('CCTV focus recentres overhead at the operator eye height, never rezooming', () => {
  // Selecting a camera must translate the view over it and look straight down
  // while HOLDING the current altitude. The v2/v3 flight derived its own range
  // from camera.rangeM, which yanked the operator to a scale they never chose.
  const flights = [];
  const EYE_HEIGHT = 8_400;
  const viewer = {
    trackedEntity: null,
    camera: {
      heading: 1.234,
      positionCartographic: { height: EYE_HEIGHT },
      flyTo(options) { flights.push(options); },
    },
  };
  const record = {
    camera: { lat: 44.4268, lon: 26.1025, absoluteHeightM: 90, headingDeg: 41 },
    position: { x: 1, y: 2, z: 3 },
  };

  assert.equal(focusCctvRecord(viewer, record, 1.9), CCTV_FOCUS_RESULT.FOCUSED);
  assert.equal(flights.length, 1);
  const [flight] = flights;
  assert.equal(flight.orientation.pitch, -Math.PI / 2, 'pitch must be nadir');
  assert.equal(flight.orientation.heading, 1.234, 'compass orientation is preserved');
  assert.equal(flight.orientation.roll, 0);

  // The destination sits directly over the camera at the SAME eye height.
  const carto = Cesium.Cartographic.fromCartesian(flight.destination);
  assert.ok(Math.abs(Cesium.Math.toDegrees(carto.latitude) - 44.4268) < 1e-6);
  assert.ok(Math.abs(Cesium.Math.toDegrees(carto.longitude) - 26.1025) < 1e-6);
  assert.ok(Math.abs(carto.height - EYE_HEIGHT) < 1, 'altitude must be unchanged');
});

test('CCTV focus keeps a minimum standoff when the operator is already below it', () => {
  // Holding the eye height literally would put the camera underground when the
  // operator is at street level; the floor keeps the recentre usable.
  const flights = [];
  const viewer = {
    trackedEntity: null,
    camera: {
      heading: 0,
      positionCartographic: { height: 5 },
      flyTo(options) { flights.push(options); },
    },
  };
  const record = {
    camera: { lat: 0, lon: 0, absoluteHeightM: 100, headingDeg: 0 },
    position: { x: 1, y: 2, z: 3 },
  };
  assert.equal(focusCctvRecord(viewer, record, 1), CCTV_FOCUS_RESULT.FOCUSED);
  const carto = Cesium.Cartographic.fromCartesian(flights[0].destination);
  assert.ok(carto.height > 100, 'never recentres below the camera mount');
});

test('CCTV focus refuses camera flights while cockpit owns the view', () => {
  const originalDocument = globalThis.document;
  let flyCalls = 0;
  const viewer = {
    trackedEntity: null,
    camera: { heading: 0, positionCartographic: { height: 900 }, flyTo() { flyCalls += 1; } },
  };
  const record = {
    camera: { lat: 0, lon: 0, absoluteHeightM: 10, rangeM: 210, headingDeg: 41 },
    position: { x: 1, y: 2, z: 3 },
  };
  const originalDebug = console.debug;
  console.debug = () => {};
  globalThis.document = {
    body: { classList: { contains: (name) => name === 'cockpit-mode' } },
  };

  try {
    assert.equal(
      focusCctvRecord(viewer, record, 1.9),
      CCTV_FOCUS_RESULT.COCKPIT_ACTIVE,
    );
  } finally {
    console.debug = originalDebug;
    globalThis.document = originalDocument;
  }
  assert.equal(flyCalls, 0);
});

test('CCTV drag-then-release over a camera is inert, while a clean tap activates and dispatches', () => {
  let timeMs = 0;
  let activationCalls = 0;
  const handler = makeGestureHandler();
  const target = new EventTarget();
  const requests = [];
  target.addEventListener(CCTV_FOCUS_REQUEST_EVENT, (event) => requests.push(event.detail));
  bindCctvWorldClickGesture(handler, () => {
    activateCctvCameraFromWorldClick('atx-cam-3', () => {
      activationCalls += 1;
      return CCTV_ACTIVATION_RESULT.ACTIVATED;
    }, target);
  }, {
    now: () => timeMs,
    eventTypes: GESTURE_TYPES,
  });

  handler.fire(GESTURE_TYPES.LEFT_DOWN, { position: { x: 10, y: 10 } });
  timeMs = 20;
  handler.fire(GESTURE_TYPES.MOUSE_MOVE, { endPosition: { x: 14, y: 10 } });
  timeMs = 40;
  handler.fire(GESTURE_TYPES.MOUSE_MOVE, { endPosition: { x: 10, y: 10 } });
  timeMs = 60;
  handler.fire(GESTURE_TYPES.LEFT_UP, { position: { x: 10, y: 10 } });
  handler.fire(GESTURE_TYPES.LEFT_CLICK, { position: { x: 10, y: 10 } });
  assert.equal(activationCalls, 0);
  assert.deepEqual(requests, []);

  timeMs = 100;
  handler.fire(GESTURE_TYPES.LEFT_DOWN, { position: { x: 10, y: 10 } });
  timeMs = 180;
  handler.fire(GESTURE_TYPES.LEFT_UP, { position: { x: 11, y: 11 } });
  handler.fire(GESTURE_TYPES.LEFT_CLICK, { position: { x: 11, y: 11 } });
  assert.equal(activationCalls, 1);
  assert.deepEqual(requests, [{ cameraId: 'atx-cam-3' }]);
});

test('CCTV auto-hop remains activation-only and never dispatches a focus request', () => {
  assert.doesNotMatch(
    maybeAutoHop.toString(),
    /activateCctvCameraFromWorldClick|gev:cctv-request-focus|dispatchEvent/,
  );
});

test('calibration v2 round-trip: writeCalibrationStoreV2 → readCalibrationStoreV2 preserves values/source/savedAt', () => {
  const storage = fakeStorage();
  const savedAt = 1782800000000;
  const entry = new Map([
    ['austin-42', {
      values: { offsetNorthM: 12.5, offsetEastM: -3.0, headingDeg: 41.0, pitchDeg: 4.0, fovDeg: -8.0, rangeScale: 1.35, heightM: 6.0 },
      source: 'manual',
      savedAt,
    }],
  ]);
  writeCalibrationStoreV2(entry, storage);

  const raw = JSON.parse(storage.getItem(CCTV_CALIBRATION_STORAGE_KEY_V2));
  assert.equal(raw['austin-42'].source, 'manual');
  assert.equal(raw['austin-42'].savedAt, savedAt);
  assert.equal(raw['austin-42'].values.offsetNorthM, 12.5);

  const restored = readCalibrationStoreV2(storage);
  assert.ok(restored instanceof Map);
  const cam = restored.get('austin-42');
  assert.equal(cam.source, 'manual');
  assert.equal(cam.savedAt, savedAt);
  assert.deepEqual(cam.values, entry.get('austin-42').values);
});

test('calibration v2: removing an entry (reset) then re-writing produces an empty store', () => {
  const storage = fakeStorage();
  const entry = new Map([
    ['sf-market-5th', { values: { offsetNorthM: 5, offsetEastM: 0, headingDeg: 0, pitchDeg: 0, fovDeg: 0, rangeScale: 1, heightM: 0 }, source: 'manual', savedAt: 1000 }],
  ]);
  writeCalibrationStoreV2(entry, storage);
  assert.ok(readCalibrationStoreV2(storage).has('sf-market-5th'));

  // Reset removes the entry from the map, then persists the now-empty map —
  // this is the shape setParams({calibration:{reset:true}}) drives.
  entry.delete('sf-market-5th');
  writeCalibrationStoreV2(entry, storage);

  const restored = readCalibrationStoreV2(storage);
  assert.equal(restored.size, 0, 'reset entry must be gone, base pose restored');
});

test('calibration v2: malformed/partial entries are dropped defensively', () => {
  const storage = fakeStorage({
    [CCTV_CALIBRATION_STORAGE_KEY_V2]: JSON.stringify({
      'ok-cam': { values: { offsetNorthM: 1, offsetEastM: 2, headingDeg: 3, pitchDeg: 4, fovDeg: 5, rangeScale: 1.1, heightM: 6 }, source: 'manual', savedAt: 42 },
      'no-values': { source: 'manual', savedAt: 42 },
      'junk': 'not-an-object',
    }),
  });
  const restored = readCalibrationStoreV2(storage);
  assert.ok(restored.has('ok-cam'));
  assert.equal(restored.get('ok-cam').values.offsetNorthM, 1);
});

test('calibration v2: a corrupt v1 key never leaks into the v2 store (v1 is dead data, never read)', () => {
  const storage = fakeStorage({
    [CCTV_CALIBRATION_STORAGE_KEY_V1]: JSON.stringify({
      'austin-42': { offsetNorthM: 999, offsetEastM: 999, headingDeg: 999, pitchDeg: 0, fovDeg: 0, rangeScale: 1, heightM: 0 },
    }),
  });
  // v2 key is untouched/empty — v1's presence must have zero effect.
  const restored = readCalibrationStoreV2(storage);
  assert.equal(restored.size, 0, 'v2 store must start empty — no legacy import (owner decision #3, §9.3)');
  assert.ok(!restored.has('austin-42'));
});

test('deriveCalBadge: CALIBRATED when the camera carries a manual v2 calibration', () => {
  const camera = { calSource: 'manual', poseSource: 'curated' };
  // Manual calibration wins over curated — a human explicitly tuned this pose.
  assert.equal(deriveCalBadge(camera), 'calibrated');
});

test('deriveCalBadge: CURATED for a hand-authored catalog prior with no manual save', () => {
  const camera = { calSource: null, poseSource: 'curated' };
  assert.equal(deriveCalBadge(camera), 'curated');
});

test('deriveCalBadge: RAW PRIOR for everything else (all Austin Open Data today)', () => {
  const camera = { calSource: null, poseSource: null };
  assert.equal(deriveCalBadge(camera), 'raw-prior');
  assert.equal(deriveCalBadge({}), 'raw-prior');
});

// ---------------------------------------------------------------------------
// Task 5 (height-datum fix): regime-aware ground resolution pure helpers.
// docs/superpowers/specs/2026-07-05-entity-height-datum-design.md §2.
// ---------------------------------------------------------------------------

test('surfaceRegimeKey: globe hidden (photoreal) → google-3d; globe visible → terrain-globe', () => {
  assert.equal(surfaceRegimeKey(false), 'google-3d');
  assert.equal(surfaceRegimeKey(true), 'terrain-globe');
});

test('surfaceRegimeKey: unknown globe state (no viewer / no scene) defaults to terrain-globe (never samples)', () => {
  // Only an explicit globe.show === false means the visible surface is the
  // Google tileset. undefined/null (torn-down viewer) must fall to the
  // regime that takes ZERO scene queries.
  assert.equal(surfaceRegimeKey(undefined), 'terrain-globe');
  assert.equal(surfaceRegimeKey(null), 'terrain-globe');
});


