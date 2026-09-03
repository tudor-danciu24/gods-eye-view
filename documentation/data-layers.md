# Data Layers

Thirteen live layers plus bundled static datasets. Eleven need no key at all.

Licensing and terms per source live in [`DATA_SOURCES.md`](../DATA_SOURCES.md) — check
it before redistributing anything.

## Live layers

| Layer | Source | Proxy | Key |
|---|---|---|---|
| Map Stack | Esri / Google / ion / OSM | — | none for Esri + OSM |
| Live Flights | OpenSky + adsb.lol | `/api/opensky`, `/api/adsblol/*` | none (optional) |
| Military Flights | adsb.lol | `/api/adsblol/mil` | none |
| Live Vessels | AISStream | `/api/ais-live` | AISStream |
| Satellites | CelesTrak | `/api/celestrak` | none |
| Earthquakes | USGS | — | none |
| Traffic | TomTom + OSM | `/api/tomtom`, `/api/overpass` | none (TomTom upgrades) |
| CCTV Mesh | Austin / Caltrans / TfL | `/api/cctv` | none |
| Radio | Radio Browser | `/api/radio` | none |
| Bikeshare | GBFS | `/api/gbfs` | none |
| Active Fires | NASA FIRMS | `/api/firms` | FIRMS |
| Space Missions | Launch Library 2 | `/api/launches` | none (optional) |
| Mapped Installations | OpenStreetMap | `/api/military-installations` | none |

**Bundled static:** Datacenters (4,351), Dams (704), Submarine Cables (712) — in
`src/data/local_data/`, each folder carrying its own provenance file.

## The basemap ladder

| You have | You get |
|---|---|
| Nothing | Esri World Imagery + keyless terrain, 2D. OSM takes over automatically if Esri is unreachable |
| Cesium ion token (free) | Google Photorealistic 3D cities + world terrain |
| Google Maps key (metered) | Same 3D direct from Google, plus in-app place search |

## Fidelity — what is measured vs. modeled

This distinction matters more than any other thing in this document. The app has
the visual grammar of a classified feed; only some of it is observation.

**Measured, live:** aircraft positions (ADS-B transponders), vessel positions (AIS
beacons), earthquakes (USGS), fire detections (NASA FIRMS satellite passes), radio
station locations, bikeshare availability, CCTV camera *positions*.

**Propagated:** satellite positions — SGP4 from published orbital elements, not
observation. Accurate, but computed.

**Interpolated:** live feeds arrive every 15–30 s. The globe renders one interval
behind real time and interpolates between known fixes; dead reckoning fills gaps.
A smoothly gliding aircraft is a smoothed track, not a continuous observation.

**Modeled or estimated:** traffic dots (see [traffic-layer.md](traffic-layer.md)),
CCTV camera *poses* (positions are published, orientations are estimated priors you
calibrate by dragging a gizmo), rocket launch trajectories (labeled
`RECONSTRUCTED ESTIMATE` in the UI).

**Incomplete by nature:** Mapped Installations is community OSM data — absence of a
site means nobody mapped it, not that nothing is there. The layer is labeled this
way deliberately.

## Data hygiene when extending

Match the existing conventions:

- **Label estimates in the UI**, not just in code comments. The launch replay's
  `RECONSTRUCTED ESTIMATE` badge is the pattern.
- **Degrade to neutral, never to alarm.** Missing congestion data renders as
  free-flow, not as a jam. An absent signal must not read as a present one.
- **Register attribution.** Sources with attribution requirements go through
  `dataCredits.js` (`registerDynamicCredit`) so the credit appears when the layer is
  active. This is a licensing obligation, not a courtesy.
- **Respect the scope line.** The project models events, assets, infrastructure, and
  systems — not people. No named-person search, face recognition, or individual
  tracking. Upstream will not merge PRs that cross this, and it is a sound line to
  hold in a fork too.

## Adding a layer

1. A module in `src/data/`, registered in `main.js`.
2. If it needs a key or has abusable quota, a proxy plugin in `vite.config.js` —
   follow the caching and budget patterns in [architecture.md](architecture.md).
3. Pure decision logic split into a Cesium-free sibling with a `.test.mjs`.
4. Attribution via `dataCredits.js`; provenance notes if you bundle static data.
5. Camera-gate the fetch so an idle globe issues no requests.
