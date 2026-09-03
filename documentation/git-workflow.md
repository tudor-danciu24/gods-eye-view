# Git Workflow

This fork: **`tudor-danciu24/gods-eye-view`**, forked from `bilawalsidhu/gods-eye-view`.

## Remotes

```
origin    https://github.com/tudor-danciu24/gods-eye-view.git   (fetch + push)
upstream  https://github.com/bilawalsidhu/gods-eye-view.git     (fetch)
upstream  DISABLED_push_to_your_fork_instead                    (push)
```

`upstream`'s push URL is deliberately broken. You have no write access to the source
repo anyway; this turns a stray `git push upstream` into an immediate local error
rather than a confusing authentication failure. To restore normal behaviour:

```bash
git remote set-url --push upstream https://github.com/bilawalsidhu/gods-eye-view.git
```

Authentication is Git Credential Manager with a cached token — pushes need no prompt.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Clean mirror of upstream. Do not commit here. |
| `dev` | Integration branch for this fork's work. |
| `fix/*`, `feat/*` | Topic branches for individual changes. |

Keeping `main` pristine is what makes upstream syncing painless. Every merge you
add to it is a conflict you inherit later.

## Syncing upstream

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
```

`--ff-only` is the load-bearing flag: it **refuses** rather than creating a merge
commit if `main` has drifted. A refusal there means something was committed to
`main` by mistake — investigate rather than forcing past it.

Then bring `dev` up to date:

```bash
git checkout dev
git merge main
```

## Starting work

```bash
git checkout dev
git pull
git checkout -b feat/your-change
# ... edit ...
git add -p
git commit
git push -u origin feat/your-change
```

## Commit messages

Match upstream's convention — `type(scope): summary` in the imperative, lowercase:

```
fix(overpass): lead with a mirror reachable from this network
docs: add maintainers and announce hosted version
chore(release): prepare v0.1.1
```

Body: explain **why**, not what. The diff shows what. Upstream's own history is a
good reference for tone.

## Before pushing — the secret check

`.env` is gitignored, but verify rather than assume:

```bash
git status --short                 # nothing unexpected staged
git ls-files | grep -E '\.env$'    # must return nothing
git log -S"<key-fragment>" --all   # must return nothing
```

If a key ever does reach a commit, **rotate it at the provider.** History rewriting
is slower, less certain, and useless once the commit has been pushed.

## Fork-specific changes

Some changes here are workarounds for this environment, not improvements to send
upstream. The Overpass mirror commit (`c5b3b28`) is one — upstream's mirrors work
fine for them, and routing OSM queries through a different provider is a local
decision.

Keep such changes on clearly-named branches and note the reasoning in the commit
body, so a future you can tell "fixes our network" from "fixes the project" when
deciding what to contribute back.

## A caution about concurrent tooling

On 2026-09-03, branch pointers in this working copy changed outside any command
that was run — a topic branch was checked out and later deleted, reverting the
working file. The commit survived only because it had already been pushed.

An IDE git integration, a GUI client, or a second agent session on the same
directory can all do this. **Commit early and push often**; treat the fork as the
source of truth rather than the working tree.
