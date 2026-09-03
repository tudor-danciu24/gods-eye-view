# Local Setup

How this fork runs on this machine (Windows 11, `C:\gods-eye-view`).

## Verified environment

| | Value | Requirement |
|---|---|---|
| Node | v26.3.0 | `>=24.14.0 <25 \|\| >=26 <27` ([package.json](../package.json)) |
| npm | 11.16.0 | — |
| Dev server | http://localhost:4173 | Vite 6.4.3 |

Node 25 is *usable* but EOL — the setup doctor warns rather than blocking it.

## Starting it

```bash
npm install
npm run doctor
npm run dev
```

`npm run doctor` ([scripts/setup-doctor.mjs](../scripts/setup-doctor.mjs)) reports Node/npm
readiness, which provider routes are live, and where each configured key was found —
without printing credential values. Run it first when something looks wrong; it
distinguishes "no key" from "key present but upstream failing" in one line.

The server binds **localhost only** ([vite.config.js:7708](../vite.config.js)). Override
with `PORT` / `HOST` env vars. Do not set `HOST=0.0.0.0` casually: a LAN-visible
server brokers every configured API key to anyone who can reach it.

## The PowerShell blocker

`npm run ...` fails in PowerShell on this machine:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because
running scripts is disabled on this system.
```

The cause is PowerShell's execution policy, which is `Undefined` at every
persistent scope and therefore defaults to `Restricted` (verified 2026-09-03):

```
MachinePolicy  Undefined
UserPolicy     Undefined
Process        Bypass
CurrentUser    Undefined
LocalMachine   Undefined
```

Two ways out.

**Option A — no policy change.** Call the `.cmd` shim, which is not a PowerShell
script and so is unaffected. Verified working:

```bash
npm.cmd run dev
```

**Option B — permit local scripts for your user.** A persistent change to a
security setting, so make it deliberately, yourself:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

`RemoteSigned` allows local scripts while still requiring downloaded ones to be
signed. `CurrentUser` scope needs no administrator rights.

Git Bash is unaffected by either — `npm run dev` works there as-is.

## Windows-specific notes

- `npm run dev:secure` and `scripts/dev-fresh.sh` are **macOS/Linux only** — shell
  scripts wired to the macOS Keychain. Use plain `npm run dev` here.
- Keys live in the repo-root `.env` on this platform, not the Keychain. See
  [provider-keys.md](provider-keys.md).
- `npm install` pulls CesiumJS; expect a few hundred MB.

## Install-script warnings

npm's allow-scripts policy blocks three postinstall scripts here:

```
esbuild@0.25.12   (postinstall)
puppeteer@24.37.5 (postinstall)
sharp@0.34.5      (install)
```

Vite starts fine regardless — esbuild resolves its platform binary through
optional dependencies. `puppeteer` and `sharp` matter only for the test suite and
image tooling. If either fails later, allow it explicitly:

```bash
npm approve-scripts puppeteer
```

`npm audit` also reports 11 vulnerabilities (2 moderate, 9 high) in the dependency
tree. `npm audit fix --force` pulls breaking major versions; for a localhost-bound
dev server this is generally not worth the churn.
