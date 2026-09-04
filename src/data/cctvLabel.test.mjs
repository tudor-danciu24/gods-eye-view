/**
 * @file CCTV in-world label invariants.
 *
 * Cases are real Windy titles pulled from the live catalogue on 2026-09-04,
 * because the title shapes are the whole problem this module solves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cctvLocationLabel } from './cctvLabel.js';

/** The overlay's primary line cap — see MAX_PRIMARY in detectionDraw.js. */
const MAX_PRIMARY = 18;

test('a "City › Bearing: Place" title reduces to the landmark', () => {
  assert.equal(
    cctvLocationLabel({ name: 'Bucharest › South-east: Piața Unirii - Bulevardul Unirii' }),
    'Piața Unirii',
  );
  assert.equal(
    cctvLocationLabel({ name: 'Roman › South-west: Piața Roman Mușat - Bulevardul Roman Mușat' }),
    'Piața Roman Mușat',
  );
});

test('a "City: Place" title reduces to the place', () => {
  assert.equal(cctvLocationLabel({ name: 'Vaslui: Crucea Gării' }), 'Crucea Gării');
  assert.equal(cctvLocationLabel({ name: 'Bacau: Ice Rink' }), 'Ice Rink');
  assert.equal(cctvLocationLabel({ name: 'Feteasca › North-east: Vama Leușeni' }), 'Vama Leușeni');
});

test('a bare title with no city prefix is used whole', () => {
  assert.equal(cctvLocationLabel({ name: 'Bâlea Lac' }), 'Bâlea Lac');
});

test('a title with a bearing but no colon still drops the city', () => {
  assert.equal(cctvLocationLabel({ name: 'Sinaia › Cota 1400' }), 'Cota 1400');
});

test('a trailing compass bearing never becomes the label', () => {
  // Real catalogue rows put the bearing LAST. The orientation arrow already
  // shows which way the camera points, so a label reading 'Centru › North-east'
  // spends its whole budget on a direction instead of a place.
  assert.equal(cctvLocationLabel({ name: 'Ploiesti: Centru › North-east' }), 'Centru');
  assert.equal(cctvLocationLabel({ name: 'Ploiesti: Centru › South-east: Piața Eroilor - Bd' }), 'Piața Eroilor');
  assert.equal(cctvLocationLabel({ name: 'Somewhere › West' }), 'Somewhere');
});

test('an unusable title falls back to the city, then to the id — never blank', () => {
  assert.equal(cctvLocationLabel({ name: '', city: 'Bucharest, Romania' }), 'Bucharest');
  assert.equal(cctvLocationLabel({ name: 'Iasi:', city: 'Iasi, Romania' }), 'Iasi');
  assert.equal(cctvLocationLabel({ name: '', city: '', id: 'windy-1' }), 'windy-1');
  assert.equal(cctvLocationLabel({}), '');
});

test('the label never leads with the raw record id', () => {
  // The regression this exists to prevent: an in-world "CAM-windy-1793907437".
  const label = cctvLocationLabel({
    name: 'Bucharest › South-east: "Bărăția" Church - Bd. I. C. Bratianu',
    city: 'Bucharest, Romania',
    id: 'windy-1793902097',
  });
  assert.ok(!label.includes('windy-'));
  assert.ok(!label.startsWith('CAM-'));
  assert.equal(label, '"Bărăția" Church');
});

test('real catalogue titles fit the drawn label budget', () => {
  // Truncation is the drawer's job, but a label that ALWAYS truncates is not a
  // location — it is a prefix. These shapes have to survive intact.
  for (const name of [
    'Bucharest › South-east: Piața Unirii - Bulevardul Unirii',
    'Vaslui: Crucea Gării',
    'Bacau: Ice Rink',
    'Feteasca › North-east: Vama Leușeni',
  ]) {
    const label = cctvLocationLabel({ name });
    assert.ok(label.length <= MAX_PRIMARY, `"${label}" (${label.length}) exceeds ${MAX_PRIMARY}`);
  }
});
