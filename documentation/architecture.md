# Architecture

Orientation for working in this repo. The authoritative runtime reference is
[`docs/CURRENT-STATE.md`](../docs/CURRENT-STATE.md); this is the shape of the thing.

## Stack

Vanilla JavaScript, **CesiumJS**, and **Vite**. No framework, no build-time
component layer. Google Photorealistic 3D Tiles render the planet; the OpenAI
Realtime API drives voice.

The consequence worth internalizing: **`vite.config.js` is not a build config, it is
the server.** At ~7,700 lines it holds every API proxy, cache, and budget governor
in the project. When something involving a network call misbehaves, that file is
where the answer lives — not in `src/`.

## Source layout

```
src/
├── main.js                 Bootstrap: 3D tiles, layer registration
├── ui.js                   Runtime UI — panels, HUD, styles, control facade
├── hud.js                  Intelligence HUD + AI scene summary
├── keySetup.js             POWER UP panel (dev server only)
├── mapStackController.js   Basemap switching — Google 3D / Esri / OSM / ion
├── iconOrientation.js      Screen-projected world headings + horizon cull
├── voice/                  OpenAI Realtime session + 28 voice tools
├── data/                   One module per layer + orchestration (87 modules)
│   └── local_data/         Bundled datasets, per-folder provenance
├── overlays/               Detection mesh, world overlay allocation
├── annotations/            Voice whiteboard — polygons, marks, routes
└── scenes/                 Cinematic scene director
```

### Module conventions

Two patterns recur and are worth matching when you add code:

**Pure logic is split out and unit-tested.** Cesium-dependent rendering stays in the
layer module; the decision logic moves to a Cesium-free sibling with a
`.test.mjs` next to it. `trafficFlowStyle.js` (thresholds, colors) versus
`traffic.js` (primitives) is the clearest example. There are 87 modules in
`src/data/` and roughly half are tests — treat a missing test as a gap, not a norm.

**Failure degrades, never throws.** Layers are written so a malformed upstream
response cannot kill the scene: one bad tile feature is skipped rather than
dropping the tile ([flowTiles.js:74](../src/data/flowTiles.js)); non-finite
congestion renders as free-flow rather than a phantom jam. Preserve this when
editing — a defensive `continue` is usually load-bearing.

## The proxy layer

Every third-party call routes through a Vite middleware plugin. This is the
project's central security and cost-control mechanism.

**Why:** any API touching a private key is brokered server-side, so the key never
reaches the browser. Only Google Maps and Cesium ion are client-exposed by
necessity (restrict those at the provider).

**What each proxy adds:** SSRF protection, response size caps, sanitized errors
(no upstream URLs or keys echoed back), disk and memory caching, and — where the
upstream costs money — a budget governor.

### Endpoints

```
/api/adsbdb              /api/launches               /api/realtime/token
/api/adsblol/mil         /api/military-installations /api/regional-brief
/api/adsblol/trace       /api/openai/hud-summary     /api/route
/api/ais-live            /api/opensky                /api/setup/keys
/api/cctv                /api/opensky-track          /api/setup/status
/api/celestrak           /api/overpass               /api/terrain/heights
/api/firms               /api/radio                  /api/tomtom
/api/gbfs                /api/realtime/debug-log     /api/weather-effects
/api/google/nearby-places
/api/google/text-search
```

### Patterns inside a proxy

Worth knowing before you write a new one, since they are consistent:

- **Multi-upstream failover.** A list of mirrors tried in order, first success
  wins, with per-upstream timeout. See `OVERPASS_UPSTREAMS`
  ([vite.config.js:191](../vite.config.js)) and `fetchOverpassPayload`.
- **Two-tier caching.** Memory (LRU, bounded entries) in front of disk
  (`.gev-cache/`), with separate TTLs. Disk survives dev-server restarts — which
  matters, because Vite restarts in-process on any config change.
- **Budget governors.** A daily counter persisted to disk; over the soft cap, the
  proxy serves stale data rather than spending more. TomTom's is
  `TOMTOM_DAILY_TILE_BUDGET`, default 40,000.
- **Sanitized responses.** Errors return a fixed generic message; the detailed
  error stays in the server log. Never echo an upstream URL — it contains the key.

## Request lifecycle

A layer's data reaches the globe roughly like this:

```
camera moves
  └─> layer module debounces, computes viewport bounds
        └─> fetch('/api/<source>')
              └─> Vite middleware: memory cache → disk cache → upstream failover
                    └─> budget check, SSRF guard, response cap
                          └─> parsed into layer primitives
                                └─> Cesium PointPrimitive / Entity / Primitive
```

Camera gating is pervasive: most layers only fetch below an altitude threshold
(traffic at ~8 km, for instance), which is why an idle globe view issues almost
no requests.
