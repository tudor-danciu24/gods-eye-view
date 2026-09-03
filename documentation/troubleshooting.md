# Troubleshooting

Failures verified on this machine, and how to diagnose new ones. Upstream's own
issue log is [`docs/KNOWN-ISSUES.md`](../docs/KNOWN-ISSUES.md) — check both.

## Diagnostic order

Work outward. Most time is lost by guessing at the wrong layer.

```bash
npm run doctor                                  # 1. keys and routes
curl -s http://localhost:4173/api/tomtom/status # 2. does the server see the key?
curl -s -o /dev/null -w "%{http_code}\n" \
     http://localhost:4173/api/<endpoint>       # 3. does the proxy work?
curl -sv --max-time 15 https://<upstream>/      # 4. is the upstream reachable?
```

Step 4 matters more than it looks. Several failures here were upstream reachability,
invisible from inside the app.

Server logs carry the detail — proxies deliberately sanitize what they return to the
browser, so the console is where the real error is.

## Verified: all shipped Overpass mirrors unreachable

**Date:** 2026-09-03 · **Status:** worked around · **Symptom:** traffic layer loads forever

All four upstreams in `OVERPASS_UPSTREAMS` drop TCP from this network, on **both**
port 80 and 443:

```
overpass-api.de           TCP timeout
overpass.kumi.systems     TCP timeout
lz4.overpass-api.de       TCP timeout
overpass.private.coffee   TCP timeout
openstreetmap.org         200 in 0.24s   <- control
```

DNS resolves; the handshake gets no SYN-ACK:

```
* Host overpass-api.de:443 was resolved.
*   Trying 65.109.112.52:443...
*   Trying 162.55.144.139:443...
* Connection timed out after 15005 milliseconds
```

Not a sandbox artifact — identical outside it. No system proxy is configured
(`ProxyEnable = 0x0`). Four independent hosts across different providers failing
simultaneously, while OSM's own site answers in 240 ms, points to a firewall rule
matching those hosts rather than four coincidental outages.

**The trap:** the TomTom key was fine throughout, and its tile counter kept climbing.
Because the layer needs *both* feeds, a healthy TomTom looks like a broken TomTom.
Check Overpass first when traffic will not load.

**Workaround** (commit `c5b3b28`): `maps.mail.ru`'s Overpass instance is reachable
and correct — verified 1,402 ways on a central Austin query — and now leads the
list. The original four remain as fallback.

Also tested: `overpass.openstreetmap.fr` is reachable but returns **403 to the
proxy's `gods-eye-view-overpass-proxy/1.0` User-Agent**. It answers a default curl,
which makes it look viable in a naive probe. Deliberately not listed.

**Cost:** ~5.7 s for a fresh area versus ~2 s from the primary mirrors. Cached areas
are instant (24 h memory, 7 days disk), so it improves as you revisit.

**The better fix,** if you control the network: allow `overpass-api.de` and revert
the commit.

## Verified: Caltrans CCTV returns zero cameras

**Date:** 2026-09-03 · **Status:** open

```
[CCTV] Loaded TfL JamCam sources: 788 available (using nearest 250)
[CCTV] Loaded Austin camera sources: 817 (using nearest 250)
[CCTV] Caltrans district fetch failed: fetch failed        (x4)
[CCTV] Loaded Caltrans camera sources: 0 inService (using nearest 0)
```

California coverage is empty; London and Austin are fine. Because the other two
sources load, this is specific to the Caltrans upstream rather than general egress.
Not yet investigated — plausibly the same network block as Overpass, but unproven.

## Observed: adsb.lol rate limiting

```
[adsb.lol Flights Fallback] upstream HTTP 429
```

Expected on the anonymous tier under heavy panning. An OpenSky key raises the
polling allowance. Not a fault.

## Observed: terrain height proxy timeouts

```
[terrain-heights-proxy] refresh incomplete (The operation was aborted due to
timeout) — serving stale points when available
```

The proxy degrades to stale points by design, so entity heights stay plausible.
Frequent occurrences suggest a slow upstream or a saturated connection.

## `npm` fails in PowerShell

Execution policy blocking `npm.ps1`. Use `npm.cmd`, or change the policy for your
user — see [local-setup.md](local-setup.md).

## Traffic will not load — checklist

1. Below ~8 km altitude? The layer is camera-gated.
2. `curl -s http://localhost:4173/api/tomtom/status` → `hasKey`?
3. Does `/api/overpass` return 200? **This is usually the failure.**
4. Are the mirrors reachable from this network?
5. Server log — proxies sanitize browser-facing errors.

## Provider Settings will not save

1. `curl -s http://localhost:4173/api/setup/status` → `setCount` and `store`.
2. The panel is loopback-only, refuses proxied requests, and disables itself
   entirely while sharing is on.
3. A POST needs an exact matching `Origin` and `Content-Type: application/json`.
4. An externally-supplied key (shell env, Keychain) is read-only and returns `409`.
5. The save path **logs nothing on success or failure** — errors return as JSON to
   the panel only. Silence in the log is not evidence the save was attempted.
