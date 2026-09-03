# Documentation

Working documentation for this fork (`tudor-danciu24/gods-eye-view`).

## What lives here vs. upstream

Upstream already ships thorough reference material. **Do not duplicate it here.**

| Upstream doc | Covers |
|---|---|
| [`docs/CURRENT-STATE.md`](../docs/CURRENT-STATE.md) | Authoritative runtime reference (~2,600 lines) — the canonical source for how the app behaves |
| [`docs/KNOWN-ISSUES.md`](../docs/KNOWN-ISSUES.md) | Upstream's open and closed issue log |
| [`docs/PERFORMANCE.md`](../docs/PERFORMANCE.md) | Cold-start and frame budget measurements |
| [`docs/opensky-auth.md`](../docs/opensky-auth.md) | OpenSky OAuth modes in detail |
| [`README.md`](../README.md) | Product overview, quick start, key/cost tables |
| [`SECURITY.md`](../SECURITY.md) | Threat model, key handling, LAN sharing rules |
| [`DATA_SOURCES.md`](../DATA_SOURCES.md) | Per-source licensing and terms |

This folder covers what upstream cannot know: **how this fork runs on this machine**,
what we verified ourselves, and the conventions we work by.

## Index

| Document | Subject |
|---|---|
| [local-setup.md](local-setup.md) | Running the app here — Node, the PowerShell blocker, ports, dev server |
| [architecture.md](architecture.md) | Repo structure and the server-side proxy pattern |
| [data-layers.md](data-layers.md) | The layers, their sources, and their proxy endpoints |
| [provider-keys.md](provider-keys.md) | How keys are stored, loaded, and added |
| [traffic-layer.md](traffic-layer.md) | Deep dive: the two-feed design, and what the dots really are |
| [git-workflow.md](git-workflow.md) | Fork remotes, branching, syncing upstream |
| [troubleshooting.md](troubleshooting.md) | Verified failures on this network and how to diagnose them |

## Conventions

- **Ground every claim.** Cite a file and line (`vite.config.js:191`) or paste the
  command output that proves it. Prefer "verified <date>" over "should".
- **Mark uncertainty explicitly.** If something was inferred rather than tested,
  say so in the text.
- **Date network findings.** Upstream availability changes; a claim about a
  mirror being unreachable is only meaningful with a date attached.
