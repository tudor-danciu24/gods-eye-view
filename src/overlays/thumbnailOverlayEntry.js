/**
 * @file Thumbnail overlay entry — geometry, style and the entry builder for the
 * world-overlay "thumbnail" paint lane.
 *
 * This began life inside the CCTV ambient-card tier. CCTV no longer paints
 * anything into the world overlay (the layer is icon + orientation arrow only),
 * but the overlay host and its draw path still implement the thumbnail variant,
 * so the builder lives here — beside the code that consumes it — rather than in
 * a data layer that no longer uses it. Without it the thumbnail draw lane would
 * be untestable.
 */
import { CCTV_THUMBNAIL_STYLE as THUMBNAIL_STYLE } from './worldOverlayTokens.js';
export const THUMBNAIL_W = 96;
export const THUMBNAIL_H = 54;

export const THUMBNAIL_CANVAS_W = 192;
export const THUMBNAIL_CANVAS_H = 108;

export const THUMBNAIL_MIN_SEP_PX = 112;

export const THUMBNAIL_SAFE_TOP_RATIO = 0.18;
export const THUMBNAIL_SAFE_TOP_MAX_PX = 150;

export const THUMBNAIL_SCALE_FULL_M = 1_800;
export const THUMBNAIL_SCALE_MID_M = 6_000;
export const THUMBNAIL_FADE_START_M = 7_500;
export const THUMBNAIL_FADE_END_M = 9_500;
export const THUMBNAIL_SCALE_AT_MID = 0.45;
export const THUMBNAIL_SCALE_MIN = 0.35;

const FADE_DISTANCE_M = 150000;

export const THUMBNAIL_OVERLAY_SOURCE_ID = 'cctv';

export const THUMBNAIL_ALTITUDE_SCALE = Object.freeze({
  fullEnd: THUMBNAIL_SCALE_FULL_M,
  midEnd: THUMBNAIL_SCALE_MID_M,
  end: THUMBNAIL_FADE_END_M,
  midValue: THUMBNAIL_SCALE_AT_MID,
  endValue: THUMBNAIL_SCALE_MIN,
  smoothToMid: true,
});

// ─── Pure helpers (exported for unit tests — no Cesium, no DOM) ────────────

/**
 * Returns whether an ambient card anchor is outside the protected top HUD
 * band. A user-pinned hover card may intentionally enter the band because it
 * is temporary and requested; persistent ambient cards yield to the HUD.
 *
 * @param {Object} input
 * @param {number} input.sy - Anchor Y in CSS pixels.
 * @param {number} input.viewH - Viewport height in CSS pixels.
 * @param {boolean} [input.pinned=false]
 * @returns {boolean}
 */

export function createFrameSlot() {
  return { frame: null, stamp: 0, failCount: 0, lastAttemptAt: 0 };
}

export function createThumbnailOverlayEntry({
  id,
  position,
  title,
  frameSlot,
  rank = 0,
  pinned = false,
  active = false,
  gapPx = 16,
} = {}) {
  const hostGap = Math.max(14, (Number(gapPx) || 14) + 6);
  return {
    id,
    position,
    variant: 'thumbnail',
    paintLane: 'thumbnail',
    title,
    details: [],
    image: frameSlot,
    requireImage: true,
    accent: THUMBNAIL_STYLE.accent,
    priority: active ? 1_000_000 : pinned ? 900_000 : 100_000 - rank,
    selected: false,
    pinned,
    protected: active,
    active,
    collisionGroup: 'ambient-card',
    zIndex: 50,
    interactive: true,
    minDistance: 0,
    maxDistance: FADE_DISTANCE_M,
    distanceFadeStartRatio: 0.7,
    altitudeScale: THUMBNAIL_ALTITUDE_SCALE,
    altitudeFadeStart: THUMBNAIL_FADE_START_M,
    altitudeFadeEnd: THUMBNAIL_FADE_END_M,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: hostGap,
    leaderOffsetPx: Math.max(2, hostGap - 6),
    verticalOnly: true,
    // CCTV shipped as a STATELESS per-frame rebuild: cards popped in and out on
    // the frame the geometry said so, and above/below was re-decided from
    // geometry every frame with no memory. Opting out of the shared arbiter's
    // min-lifetime, re-entry cooldown, fades and sticky corner restores that
    // feel — the hysteresis is what produced sticky mid-screen below-placements
    // and the ~1.5 s delay before a card could come back after a nadir sweep.
    stateless: true,
    // The shipped per-frame pass rejected cards whose ANCHORS were closer than
    // this (scaled with the card). Rectangle overlap alone let them stack about
    // twice as densely, because the leader gap does not shrink with the card.
    minAnchorSeparationPx: THUMBNAIL_MIN_SEP_PX,
    viewportMargin: 4,
    viewportPadding: 60,
    safeTopRatio: THUMBNAIL_SAFE_TOP_RATIO,
    safeTopMaxPx: THUMBNAIL_SAFE_TOP_MAX_PX,
    pinnedBypassesSafeTop: true,
    thumbnailWidth: THUMBNAIL_W,
    thumbnailHeight: THUMBNAIL_H,
    thumbnailPadX: THUMBNAIL_STYLE.padding,
    thumbnailPadTop: THUMBNAIL_STYLE.padding,
    thumbnailPadBottom: THUMBNAIL_STYLE.padding,
    thumbnailTitleGap: 2,
    thumbnailTitleHeight: THUMBNAIL_STYLE.titleHeight,
    thumbnailTitleChars: THUMBNAIL_STYLE.titleChars,
    thumbnailBackground: THUMBNAIL_STYLE.background,
    thumbnailTitleColor: THUMBNAIL_STYLE.titleColor,
    thumbnailTitleFont: THUMBNAIL_STYLE.titleFont,
    thumbnailLeaderColor: THUMBNAIL_STYLE.leader,
    thumbnailRuleColor: THUMBNAIL_STYLE.rule,
    thumbnailRuleHeight: THUMBNAIL_STYLE.ruleHeight,
    thumbnailRadius: THUMBNAIL_STYLE.radius,
  };
}

