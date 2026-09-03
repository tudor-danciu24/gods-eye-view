# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

God's Eye View — a browser-based 3D intelligence console. Vanilla JS + CesiumJS +
Vite, no framework. A fork of `bilawalsidhu/gods-eye-view`.

**`vite.config.js` is the server, not a build config.** At ~7,700 lines it holds
every API proxy, cache, and budget governor. Anything involving a network call is
answered there, not in `src/`.

## Read before working

1. **[documentation/README.md](documentation/README.md)** — the documentation map.
   It has task-shaped reading paths ("a layer won't load", "adding a data layer")
   and a subsystem → source → doc table. Start there to find the right file.
2. **[docs/CURRENT-STATE.md](docs/CURRENT-STATE.md)** — the authoritative runtime
   reference. Structured section begins at **line 1557**; everything before is a
   reverse-chronological changelog.

Precedence when sources disagree: `docs/CURRENT-STATE.md` → `docs/opensky-auth.md`
→ `CHANGELOG.md` → `documentation/`. The `documentation/` folder is a view over the
others, never an override.

## Working rules

- **Read the module header before changing behaviour.** Many `@file` docblocks
  encode invariants *with rationale* — what broke, and what the field test showed.
  Those comments are the record of findings you would otherwise rediscover.
- **Odd-looking code is often load-bearing.** Defensive `continue`s, neutral
  fallbacks, and "unnecessary" epoch rechecks are usually deliberate. Establish why
  something exists before removing it.
- **Failure degrades, never throws.** A malformed upstream response must not kill
  the scene. Missing data renders neutral, never alarming — non-finite congestion
  shows free-flow, not a phantom jam.
- **Pure logic is split out and unit-tested.** Cesium-dependent rendering stays in
  the layer module; decisions move to a Cesium-free sibling with a `.test.mjs`.
  Follow the pattern rather than inlining logic into rendering code.
- **Be honest in status surfaces.** Degrade in the status line, not in the offer.
  Never show a green `ON` over an empty globe.

## Invariants not to "fix"

| Behaviour | Why it is that way |
|---|---|
| Flights render one poll interval **behind** real time | Deliberate — rendering at the live edge means extrapolating, which snaps on the next poll |
| Detection density starts on but does **not** set `_detectionUserOverridden` | An automatic default may be overwritten by automation; a user choice may not |
| The setup panel disables itself when sharing is on | Tunnelled traffic also arrives from loopback, so socket identity cannot carry that boundary |
| `X-Frame-Options: DENY` on every response | Blocks a clickjack against Provider Settings. Removing it re-opens a credential-write attack |
| Earthquake discs are static geometry | A `CallbackProperty` axis cost 32.4 ms/frame. Pinned by a test |

If a change requires breaking one of these, say so explicitly and explain the
replacement guarantee — do not do it silently.

## Rendering

The app runs an idle render governor (`src/renderGovernor.js`). Per-frame animators
register a hold; **every other scene mutation must call `governorRequestRender()`**
or it will not appear. "State changed but the screen didn't" is almost always this.

## Commands

```bash
npm run doctor          # environment + provider readiness — run first when stuck
npm run dev             # localhost:4173; the only mode where every proxy is live
npm test                # unit suite (165 files)
npm run test:track      # headless tracking/model/detection invariants
npm run build           # build gate — note it drops the proxies
```

On Windows PowerShell, `npm` may be blocked by execution policy; use `npm.cmd`.

## Definition of done

- Tests pass. After touching tracking, interpolation, icon orientation, or the
  ground datum, run `npm run test:track` — unit tests cannot catch a camera-follow
  regression.
- **`docs/CURRENT-STATE.md` is updated in the same change set** as any runtime or
  architecture change. That is the repo's own stated maintenance rule; a behaviour
  change without it is an incomplete change set.
- Update the relevant file in `documentation/` if the change alters something it
  describes.

## Do not

- Commit or push unless explicitly asked, each time.
- Add features for named-person search, face recognition, or tracking individuals.
  The project models events, assets, infrastructure, and systems — not people.
  Upstream will not merge PRs that cross this line.
- Put a private key anywhere the browser can read it. Only `GOOGLE_MAPS_API_KEY`
  and `CESIUM_ION_TOKEN` are client-exposed, by SDK necessity.
- Let third-party data flow into the model as instructions. Radio tool results omit
  station names for exactly this reason.
