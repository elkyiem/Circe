# Run Iris locally

Checkout: `/Users/elkyiem/Documents/GitHub/iris-web`, branch `web`.
Origin: `https://github.com/elkyiem/Iris.git`.
Upstream: `https://github.com/raphaelsalaja/pond.git`.
The older `/Users/elkyiem/Documents/GitHub/Iris` checkout is outside this work's
write scope. Its current on-disk Git identity differed from the supplied legacy
checkout description; it was inspected read-only and left untouched.

Use Node 24 (`.nvmrc`) and pnpm 11.27.0 (`packageManager`). For this machine:

```sh
cd /Users/elkyiem/Documents/GitHub/iris-web
export PATH=/Users/elkyiem/.nvm/versions/node/v24.14.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm --filter @pond/desktop build
pnpm --filter @pond/desktop build:web
IRIS_WEB_ORIGINS=https://elkyiem.tailffeb5b.ts.net:9443 pnpm --filter @pond/desktop start:web
```

Open `http://127.0.0.1:4789`. Connect using the key in
`.artifacts/iris-web-sandbox/web-access-key`; keep its contents private. The file
picker reads a file on the visiting device, not a host filesystem path. The host
profile and disposable Library live entirely under that sandbox. Do not point
`POND_SANDBOX` at the owner's Pond profile or Library.

Only the chat designated runtime owner may start this long-running host. This
kickoff chat was explicitly designated. Other chats use finite checks and the
shared running instance. Stop with Ctrl-C before starting a replacement. Rebuild
both clients after source changes; this launcher serves production bundles and
does not watch files. It does not install or replace the installed Pond app.

Optional environment variables:

| Variable | Meaning |
| --- | --- |
| `POND_SANDBOX` | Separate disposable profile root; default `.artifacts/iris-web-sandbox` |
| `IRIS_WEB_PORT` | Loopback listener port; default 4789 |
| `IRIS_WEB_ORIGIN` | Primary exact browser origin; defaults to loopback HTTP |
| `IRIS_WEB_ORIGINS` | Additional exact HTTPS origins, comma-separated; no paths or wildcard |
| `IRIS_WEB_FIXTURES` | `1` enables offline fixtures; `0` disables them |

Fixture mode is on in the development launcher. Enqueue Quoted post, Original
image or Video in the browser connection bar; inspect progress in Downloads.
Repeated requests deduplicate by the original source identity. The generated
video is a four-second ffmpeg `testsrc2` clip; the image is a purpose-built graphic.
Fixture media is served only to host-loopback requests. No source login is
required and no account cookies are copied. Enabling fixtures turns on Twitter
video downloads in this disposable profile so its original video passes through
the regular fetch tasks.

## Verification

```sh
pnpm check
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @pond/desktop build:web
pnpm --filter @pond/desktop exec vitest run src/main/web src/shared/web-serialization.test.ts src/main/lib/byte-range.test.ts src/main/core/pipeline/workers/capture-tweet.test.ts src/renderer/src/features/saves/lib/media/file-viewer.test.ts
pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs
# Finite browser UI check, separate temporary Chromium profile:
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs
# Stop and restart the same sandbox host, then:
pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs --after-restart
```

The finite HTTP smoke reads its sandbox key privately, checks queue-backed
image/video ingestion, card files and Capture identity, original media selection,
authenticated media and ranges, folder create/add/remove, pagination and search.
It writes verification IDs inside the sandbox for the restart check. It never
reads or mutates the production Library. The browser smoke drives the actual
renderer without a preload bridge or Node integration: search, fixture enqueue,
folder create/add/remove, image/video viewing and seeking, reload, and mobile
widths. Screenshots and video state are written under
`.artifacts/web-verification`. For disconnection verification, run that script
with `--disconnect`, wait for `WEB_BROWSER_READY_FOR_DISCONNECT`, then stop only
the isolated host. It records the visible disconnection banner. Restart the same
host and run the persistence check. Live account/source checks remain separate
and require an explicitly connected test session.

## Private HTTPS and the assistant

The current private URL is `https://elkyiem.tailffeb5b.ts.net:9443`. It uses the
same isolated host and access-key login. Tailscale Serve preserves the existing
routes on other ports. Recreate only Iris's mapping if needed:

```sh
tailscale serve --bg --https=9443 http://127.0.0.1:4789
# Remove only this mapping:
tailscale serve --https=9443 off
```

This is private Serve, not Funnel. Another device must be on the authorized
tailnet. Keep the host's additional origin configured when restarting it.

The isolated profile is connected to the owner's authorized ChatGPT subscription
through Pond's existing Codex CLI provider. It stores connection state, not CLI
tokens, and uses the host's file-backed CLI sign-in through the existing isolated
CLI runtime. Select **Codex → Codex Default** in the assistant composer. This
subscription connection supports text and Library tools; binary vision requires
a capable provider. No cloud API key was supplied or stored by this work.

Additional finite checks against the running host:

```sh
pnpm --filter @pond/desktop exec node scripts/smoke-web-parity.mjs
# Live model use; requires the explicitly authorized, connected subscription:
pnpm --filter @pond/desktop exec node scripts/smoke-web-agent.mjs
IRIS_WEB_ORIGIN=https://elkyiem.tailffeb5b.ts.net:9443 pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs --after-restart
```

The parity smoke checks edits/conflicts/Undo, tags, views, Canvas content conflicts,
staged upload retry, package Capture/media retention, CSV and conversion downloads,
attachment registration, video frames and authenticated compatible preview ranges.
Package reimport into the same Library proves the existing dedup path; a fresh
Library round trip remains a separate acceptance check. The live assistant check
uses only disposable fixture metadata and validates persisted sources and tool steps.

To connect a Source, use **Sources → New Source**. Sign-in opens on the host in an
isolated window; being signed in to Twitter in normal Chrome does not connect
this collector. Complete sign-in there and then choose import scope. Do not copy
normal Chrome cookies or repoint the installed extension/native host. Live Source
coverage remains pending until that explicit test connection is completed.
