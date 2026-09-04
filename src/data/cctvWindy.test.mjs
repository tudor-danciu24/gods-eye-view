/**
 * @file Windy Webcams CCTV pack — pure-logic invariants.
 *
 * The pack replaced three open-data sources whose image URLs were permanently
 * valid. Windy's are not: a free-tier token dies after 10 minutes and then
 * answers 401. Most of what is pinned here exists because that difference is
 * silent — a stale URL renders as an ordinary fetch miss, not as an error —
 * so the tests assert the URL is never trusted past its half-life and that a
 * third-party JSON body can never steer a fetch off Windy's own hosts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWindyAnchors,
  isPinnedWindyImageUrl,
  pickWindyImageUrl,
  pickWindyDetailUrl,
  windyWebcamToSource,
  resolveWindySnapshotUrl,
} from '../../vite.config.js';

// Real free-tier shapes, captured from a live v3 response on 2026-09-04.
const IMG = 'https://imgproxy.windy.com/_/preview/plain/current/1234512/original.jpg?v=2';
const IMG2 = 'https://imgproxy.windy.com/_/preview/plain/current/1234512/original.jpg?v=3';

/** Minimal live-webcam record in the shape the v3 list endpoint returns. */
const webcam = (over = {}) => ({
  webcamId: 1234512,
  status: 'active',
  title: 'Piata Unirii',
  location: { city: 'Bucharest', country: 'Romania', latitude: 44.4268, longitude: 26.1025 },
  images: { current: { preview: IMG, thumbnail: IMG, icon: IMG } },
  urls: { detail: 'https://windy.com/webcams/1234512' },
  ...over,
});

// --- Anchors -------------------------------------------------------------

test('anchor specs parse to lat/lon/radius triples and clamp the radius', () => {
  const anchors = parseWindyAnchors('44.4268,26.1025,90;51.5074,-0.1278');
  assert.equal(anchors.length, 2);
  assert.deepEqual(anchors[0], { lat: 44.4268, lon: 26.1025, radiusKm: 90 });
  // A triple with no radius takes the default rather than being dropped.
  assert.equal(anchors[1].radiusKm, 60);
  // Windy 400s past 250 km, so the clamp has to happen before the request.
  assert.equal(parseWindyAnchors('0,0,9000')[0].radiusKm, 250);
  assert.equal(parseWindyAnchors('0,0,0.1')[0].radiusKm, 5);
});

test('one malformed anchor cannot blank worldwide coverage', () => {
  // The whole spec is operator-supplied via CCTV_WINDY_ANCHORS. A typo in the
  // middle must cost that anchor only — an empty result disables CCTV entirely.
  const anchors = parseWindyAnchors('44.4,26.1,90;garbage;999,999,60;51.5,-0.12,60');
  assert.equal(anchors.length, 2);
  assert.deepEqual(anchors.map((a) => a.lat), [44.4, 51.5]);
});

// --- Origin pinning ------------------------------------------------------

test('image URLs are pinned to Windy hosts over https', () => {
  assert.equal(isPinnedWindyImageUrl(IMG), true);
  assert.equal(isPinnedWindyImageUrl('http://imgproxy.windy.com/a.jpg'), false);
  assert.equal(isPinnedWindyImageUrl('https://evil.example/a.jpg'), false);
  // Suffix lookalikes must not pass — the check is hostname equality, not endsWith.
  assert.equal(isPinnedWindyImageUrl('https://imgproxy.windy.com.evil.test/a.jpg'), false);
  assert.equal(isPinnedWindyImageUrl('not a url'), false);
  assert.equal(isPinnedWindyImageUrl(''), false);
});

test('an off-host image URL yields no frame rather than an off-host fetch', () => {
  // The URL arrives inside a third-party JSON body; it is untrusted input.
  const hijacked = webcam({ images: { current: { preview: 'https://evil.example/x.jpg' } } });
  assert.equal(pickWindyImageUrl(hijacked), '');
});

test('image selection prefers preview and falls back through smaller sizes', () => {
  assert.equal(pickWindyImageUrl(webcam()), IMG);
  const thumbOnly = webcam({ images: { current: { preview: 'https://evil.example/x.jpg', thumbnail: IMG } } });
  assert.equal(pickWindyImageUrl(thumbOnly), IMG);
  assert.equal(pickWindyImageUrl({}), '');
});

test('the required attribution link is pinned to windy.com pages', () => {
  assert.equal(pickWindyDetailUrl(webcam()), 'https://windy.com/webcams/1234512');
  assert.equal(pickWindyDetailUrl(webcam({ urls: { detail: 'https://evil.example/1' } })), '');
  assert.equal(pickWindyDetailUrl(webcam({ urls: {} })), '');
});

// --- Row normalization ---------------------------------------------------

test('a live webcam becomes a RAW PRIOR camera row with a durable handle', () => {
  const row = windyWebcamToSource(webcam());
  assert.equal(row.id, 'windy-1234512');
  assert.equal(row.windyWebcamId, '1234512');
  assert.equal(row.lat, 44.4268);
  assert.equal(row.lon, 26.1025);
  assert.equal(row.provider, 'Windy Webcams');
  assert.equal(row.city, 'Bucharest, Romania', 'the panel shows a real place, not the Global fallback');
  assert.equal(row.detailUrl, 'https://windy.com/webcams/1234512');
  // Windy publishes no orientation, so the pose must stay low-confidence —
  // that is what keeps the panel badge on RAW PRIOR instead of claiming a fix.
  assert.equal(row.headingConfidence, 'low');
  assert.ok(Number.isFinite(row.headingDeg));
  assert.notEqual(row.poseSource, 'curated');
});

test('the frame-serve URL is never taken from the stored row', () => {
  // `url` is what /media/ and the non-Windy /frame/ path read directly. Leaving
  // it empty is deliberate: a Windy row must route through the resolver, since
  // any URL stored at catalog-build time expires before the catalog rebuilds.
  const row = windyWebcamToSource(webcam());
  assert.equal(row.url, '');
  assert.equal(row.snapshotUrl, IMG, 'snapshotUrl is a seed for the resolver, not a durable URL');
});

test('inactive and unlocated webcams are dropped, not rendered', () => {
  // An inactive camera still serves its last-known frame, which would appear
  // in-world as live surveillance.
  assert.equal(windyWebcamToSource(webcam({ status: 'inactive' })), null);
  assert.equal(windyWebcamToSource(webcam({ location: { latitude: null, longitude: 26.1 } })), null);
  assert.equal(windyWebcamToSource(webcam({ webcamId: '' })), null);
  // A missing status field fails open — a schema change must not empty the layer.
  assert.ok(windyWebcamToSource(webcam({ status: undefined })));
});

// --- Expiring-URL resolution --------------------------------------------

test('a pinned seed URL is reused without a round trip', async () => {
  let calls = 0;
  const url = await resolveWindySnapshotUrl('900001', IMG, {
    fetchImpl: async () => { calls += 1; return new Response('{}'); },
  });
  assert.equal(url, IMG);
  assert.equal(calls, 0, 'a fresh catalog seed must not cost a per-camera request');
});

test('an unpinned seed is discarded and re-resolved from the API', async () => {
  process.env.WINDY_WEBCAMS_API_KEY = 'test-key';
  let sentKey = '';
  const url = await resolveWindySnapshotUrl('900002', 'https://evil.example/x.jpg', {
    fetchImpl: async (_u, opts) => {
      sentKey = opts.headers['x-windy-api-key'];
      return new Response(JSON.stringify({ images: { current: { preview: IMG2 } } }));
    },
  });
  assert.equal(url, IMG2);
  assert.equal(sentKey, 'test-key', 'the key travels server-side in the header, never in a URL');
});

test('a forced re-resolve bypasses the cache — the post-401 retry path', async () => {
  process.env.WINDY_WEBCAMS_API_KEY = 'test-key';
  const first = await resolveWindySnapshotUrl('900003', IMG, { fetchImpl: async () => new Response('{}') });
  assert.equal(first, IMG);
  const forced = await resolveWindySnapshotUrl('900003', '', {
    force: true,
    fetchImpl: async () => new Response(JSON.stringify({ images: { current: { preview: IMG2 } } })),
  });
  assert.equal(forced, IMG2, 'an expired token must be replaceable without waiting for the catalog TTL');
});

test('resolution failures degrade to no frame instead of throwing', async () => {
  process.env.WINDY_WEBCAMS_API_KEY = 'test-key';
  assert.equal(await resolveWindySnapshotUrl('900004', '', {
    fetchImpl: async () => new Response('nope', { status: 500 }),
  }), '');
  assert.equal(await resolveWindySnapshotUrl('900005', '', {
    fetchImpl: async () => { throw new Error('network down'); },
  }), '');
  assert.equal(await resolveWindySnapshotUrl('', ''), '');
});

test('with no key configured the resolver returns nothing rather than calling out', async () => {
  const saved = process.env.WINDY_WEBCAMS_API_KEY;
  delete process.env.WINDY_WEBCAMS_API_KEY;
  let calls = 0;
  const url = await resolveWindySnapshotUrl('900006', '', {
    fetchImpl: async () => { calls += 1; return new Response('{}'); },
  });
  assert.equal(url, '');
  assert.equal(calls, 0);
  if (saved !== undefined) process.env.WINDY_WEBCAMS_API_KEY = saved;
});
