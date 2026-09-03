# Traffic Layer

The layer with the widest gap between what it looks like and what it is. Worth
understanding before trusting anything it shows.

## Two feeds, both required

| Feed | Supplies | Endpoint |
|---|---|---|
| **OSM Overpass** | Road polylines for the viewport | `/api/overpass` |
| **TomTom** | Congestion ratio per road segment | `/api/tomtom` |

Geometry comes from Overpass; congestion from TomTom. **Neither alone renders
anything useful.** With flow but no geometry the layer loads indefinitely — there
are no roads to place dots on. This is the single most common failure mode; see
[troubleshooting.md](troubleshooting.md).

## Two modes

Decided once per session via `/api/tomtom/status`:

- **`sim`** (keyless default) — white dots at hardcoded per-road-class speeds.
- **`live`** — TomTom flow tiles matched onto the same Overpass roads. Matched roads
  color, slow, and densify their dots by real congestion; closed roads spawn none;
  unmatched roads stay simulated white.

Note what this means: **live mode still draws simulated dots.** The TomTom data
modulates them; it does not supply them.

## What TomTom actually returns

The proxy requests
`traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf` ([vite.config.js:1887](../vite.config.js)).
The response is a vector tile of road segment polylines, each carrying one number:

> `traffic_level` — current speed ÷ free-flow speed, 0..1, where 1 is free flow.
> ([trafficFlowStyle.js:6](../src/data/trafficFlowStyle.js))

That is the entire payload. No vehicle positions, no counts, no identities. The app
buckets the ratio into three colors:

| Bucket | Threshold | Color |
|---|---|---|
| free | ≥ 0.85 | green `#2ecc71` |
| slow | ≥ 0.55 | amber `#f0b23e` |
| jam | < 0.55 | red `#e05252` |

Non-finite input degrades to free-flow — deliberately, so unusable data never
renders as a phantom traffic jam.

### Where TomTom's number comes from

Aggregated, anonymized probe data: connected-car fleets, TomTom nav devices and SDK
partner apps, plus government road sensors in some regions. Millions of traces per
segment collapse into one speed statistic. The individual traces are the discarded
*input*; the segment average is the *product*.

This is why coverage varies — dense arterials have plentiful probes, rural roads may
have none, and a segment with too few probes returns no usable level at all.

Latency: roughly one to two minutes behind reality, plus the app's own cache TTL and
budget governor. Fine for seeing where a city is congested; not something to route
by.

## The dots are not vehicles

The moving dots are `PointPrimitive`s the app spawns along Overpass polylines,
lerped between pre-computed waypoints every frame ([traffic.js:21](../src/data/traffic.js)).
Their count is a **rendering budget allocated across visible roads**, not an
observation of how many cars are present.

### The `VEH-####` labels are array indices

With the detection overlay on, dots get labels like `VEH-0266`. These look exactly
like tracked contact IDs. They are not:

```js
id: `VEH-${String(i).padStart(4, '0')}`,
```

[traffic.js:2413](../src/data/traffic.js) — **`i` is the loop index into the local
`_dots` array.** `VEH-0266` means "element 266 of an in-memory array."

The tell: `_dots` is emptied and rebuilt on viewport change
([traffic.js:2155](../src/data/traffic.js), [traffic.js:2195](../src/data/traffic.js)).
A real tracking identity survives a refetch — an ADS-B hex code stays with its
aircraft. These do not. Pan away and back, and `VEH-0266` is a different dot on a
different street. Which dots get labeled at all depends on the `maxCount` and `seed`
arguments to `getDetectableObjects()`, not on anything in the world.

**This is a UI honesty problem, not a data problem.** The layer is accurate at the
data level; the label styling borrows the visual grammar of the aircraft layer,
where IDs *are* real transponder identities. If you extend this layer, consider not
propagating that.

### So what is real on screen

| Real | Synthetic |
|---|---|
| Street geometry (OSM) | Every dot's existence |
| Segment colors, in live mode with a match | Dot positions along the road |
| | Dot count |
| | `VEH-####` identifiers |

The privacy story holds up in the code: aggregate speed statistics, never vehicle
positions. Nobody is tracked into a pixel. The UI just oversells what it has.

## Performance characteristics

- **Camera-gated** — active only below ~8 km altitude.
- **Two-pass road fetch** — major roads first (fast), then the full graph.
- Fetch bounds center on the camera's look-at point (`trafficBounds.js`).
- Roads cached by clamped bounding-box key; Overpass responses cached 24 h in
  memory, 7 days on disk.
- Dot budget distributed fairly across visible roads under a hard cap.

Upstream notes traffic can be slow or uneven when panning across dense city blocks
([docs/KNOWN-ISSUES.md](../docs/KNOWN-ISSUES.md)).

## Key modules

| Module | Role |
|---|---|
| `traffic.js` | Layer orchestration, dot spawning, Cesium primitives |
| `flowTiles.js` | Decode TomTom MVT → polylines + `traffic_level` |
| `flowMatch.js` | Match flow segments onto Overpass roads |
| `trafficFlowStyle.js` | Pure: level → bucket / color / speed / density |
| `trafficBounds.js` | Viewport → fetch bounding box |
| `trafficQueue.js` | Fetch scheduling |
