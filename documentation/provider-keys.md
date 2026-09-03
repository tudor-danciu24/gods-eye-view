# Provider Keys

How keys are stored, loaded, and added in this fork.

## The model

Keys are **upgrades, not prerequisites.** The app boots fully keyless: Esri World
Imagery satellite basemap, keyless terrain, and eleven of thirteen layers live.
Each key switches on additional capability.

You never need to edit a file. The in-app panel writes the store for you.

## Where keys live on this machine

| Launch path | Store |
|---|---|
| Plain `npm run dev` (this machine) | repo-root `.env` |
| Pinokio-managed launch | `pinokio/ENVIRONMENT` (gitignored) |
| macOS `dev-fresh.sh` | macOS Keychain |

Which store the panel owns is decided by a launcher marker captured **before**
Vite merges dotenv into `process.env` ([vite.config.js:7447](../vite.config.js)) —
deliberately, so a stray `GEV_LAUNCHER=pinokio` line inside someone's `.env`
cannot silently redirect writes to a store that was never loaded.

Confirm which store is active:

```bash
curl -s http://localhost:4173/api/setup/status
```

The `store` field reads `env-file` or `pinokio-environment`.

**`.env` is gitignored** ([.gitignore:3](../.gitignore)) and verified untracked. The
one tracked env-shaped file, `pinokio/_ENVIRONMENT`, is upstream's template with
every key commented out — note the underscore prefix distinguishing it from the
live file.

## Adding a key

**In the app (preferred).** Click the **POWER UP** chip, bottom-right. If a narrow
layout hides it, `http://localhost:4173/?setup=1` opens the same panel. Paste, hit
**SAVE KEYS**. The panel hardens file permissions *before* writing the secret, sets
`process.env` live, then restarts the dev server.

**Via the API** — same hardened path, useful for scripting:

```bash
curl -X POST http://localhost:4173/api/setup/keys \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4173" \
  -d '{"TOMTOM_API_KEY":"..."}'
```

Both headers are mandatory; see the admission gate below.

**By hand.** Write `.env` directly, then restart. Vite watches `.env` and restarts
on change, so the key is picked up without an explicit restart.

## The admission gate

`admitKeySetupRequest` ([src/keySetupCore.mjs](../src/keySetupCore.mjs)) guards both
setup endpoints. It refuses:

- Any request carrying reverse-proxy headers (`x-forwarded-for`, `cf-ray`, `via`, …) —
  a proxied request did not originate on this machine whatever the socket claims
- Any request while sharing is enabled (`PINOKIO_SHARE_*`)
- Any non-loopback remote address
- A POST with a missing or non-matching `Origin`
- A POST without `Content-Type: application/json`

Note the design decision: **sharing disables the surface outright rather than
trusting the socket.** Tunnelled traffic reaches the server from loopback too, so
socket identity cannot carry that boundary.

A further rule worth knowing: a key supplied *externally* (shell environment,
Keychain) is read-only to the panel and returns `409`. This guards replace as well
as remove, so a clickjacked same-origin POST cannot overwrite a live value.

## What each key unlocks

| Tier | Key | Unlocks |
|---|---|---|
| free | **Cesium ion** | Google Photorealistic 3D + world terrain (eligible personal, non-commercial use) |
| metered | **Google Maps** | Same 3D direct from Google, plus in-app place search |
| metered | **OpenAI** | Voice control + AI HUD summary |
| free | **AISStream** | Live global vessels |
| free | **NASA FIRMS** | Live active-fire detections |
| free | **TomTom** | Real traffic flow instead of a simulation |
| free | **OpenSky** | More flight-polling credits (anonymous works without) |
| free | **Launch Library 2** | Higher space-missions allowance (works without) |

Highest value for the least effort: **Cesium ion**. It is free and it changes the
app more than anything else on the list.

## Cost control

OpenAI Realtime voice is the only meaningfully metered path. The app governs it
directly: a live session-spend readout beside the mic, an STD/MINI model toggle, a
$2 warning, and a **$5 hard cap that ends the session**. The voice context window
is kept deliberately short.

Server-side budget governors cap the rest — TomTom's daily tile budget defaults to
40,000. These are **app-level guards, not billing caps.** Set provider-side budgets
(Google Cloud budgets, OpenAI usage limits) as the authoritative control.

## Handling

- Keys in this repo's stores are **local plaintext**. On macOS the Keychain route is
  stronger; on Windows there is no equivalent here.
- Never paste a key into a chat, an issue, or a commit. If one is exposed, rotate it
  at the provider — that is faster and more complete than trying to scrub it.
- Do not use Pinokio 8.0.40's native **Configure** panel: that release saves this
  nested layout to the wrong path *and logs submitted values.*
