/**
 * @file Antenas parsing invariants.
 *
 * The layer is a skeleton, but these are the rules the eventual upstream has to
 * satisfy, and they are the ones that fail silently if broken: a null
 * coordinate that coerces to 0 renders an antenna in the ocean, and a malformed
 * payload that throws takes the scene down with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTENAS_MAX_RECORDS,
  normalizeAntena,
  parseAntenasPayload,
  readCoord,
} from './antenasParse.js';

const row = (over = {}) => ({ id: 'ant-1', lat: 44.4268, lon: 26.1025, name: 'Test mast', heightM: 60, ...over });

test('a well-formed row becomes a record', () => {
  const record = normalizeAntena(row());
  assert.deepEqual(record, {
    id: 'ant-1', lat: 44.4268, lon: 26.1025, name: 'Test mast', heightM: 60,
  });
});

test('absent coordinates are absent, never zero', () => {
  // Number(null) is 0 — the trap this guards. A dropped record is correct;
  // an antenna at 0,0 is a fabricated position.
  assert.ok(Number.isNaN(readCoord(null)));
  assert.ok(Number.isNaN(readCoord('')));
  assert.ok(Number.isNaN(readCoord(undefined)));
  assert.ok(Number.isNaN(readCoord('not a number')));
  assert.equal(readCoord('44.5'), 44.5);
  assert.equal(readCoord(0), 0, 'a real zero coordinate still reads as zero');
});

test('rows that cannot be placed honestly are dropped', () => {
  assert.equal(normalizeAntena(row({ lat: null })), null);
  assert.equal(normalizeAntena(row({ lon: undefined })), null);
  assert.equal(normalizeAntena(row({ id: '' })), null);
  assert.equal(normalizeAntena(row({ lat: 91 })), null, 'out-of-range latitude');
  assert.equal(normalizeAntena(row({ lon: -181 })), null, 'out-of-range longitude');
  assert.equal(normalizeAntena(null), null);
  assert.equal(normalizeAntena('nope'), null);
});

test('an unpublished height stays unknown rather than becoming ground level', () => {
  const record = normalizeAntena(row({ heightM: null }));
  assert.ok(Number.isNaN(record.heightM));
  assert.equal(normalizeAntena(row({ heightM: 0 })).heightM, 0, 'a real zero survives');
});

test('the name falls back to the id instead of rendering blank', () => {
  assert.equal(normalizeAntena(row({ name: '' })).name, 'ant-1');
});

test('payloads parse from a bare array or a wrapped object', () => {
  assert.equal(parseAntenasPayload([row()]).length, 1);
  assert.equal(parseAntenasPayload({ antenas: [row()] }).length, 1);
});

test('a malformed payload degrades to empty instead of throwing', () => {
  for (const bad of [null, undefined, 42, 'text', {}, { antenas: 'nope' }]) {
    assert.deepEqual(parseAntenasPayload(bad), [], `payload ${JSON.stringify(bad)}`);
  }
});

test('duplicate ids collapse and the record count is bounded', () => {
  const dupes = [row({ id: 'a' }), row({ id: 'a', name: 'Second' }), row({ id: 'b' })];
  const parsed = parseAntenasPayload(dupes);
  assert.equal(parsed.length, 2);
  assert.equal(parsed.find((r) => r.id === 'a').name, 'Second', 'last write wins');

  const many = Array.from({ length: 50 }, (_, i) => row({ id: `ant-${i}` }));
  assert.equal(parseAntenasPayload(many, { max: 10 }).length, 10);
  assert.ok(ANTENAS_MAX_RECORDS > 0);
});
