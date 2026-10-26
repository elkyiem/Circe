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
pnpm --filter @pond/desktop exec node scripts/smoke-web-canvas.mjs
pnpm --filter @pond/desktop exec node scripts/smoke-web-imports.mjs
pnpm --filter @pond/desktop exec node scripts/smoke-web-package.mjs
pnpm --filter @pond/desktop exec node scripts/smoke-web-identity.mjs
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs --identity
# Add purpose-built files to the disposable Library, then verify each viewer:
pnpm --filter @pond/desktop exec node scripts/prepare-web-viewers.mjs
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs --viewers
# New Note, real editor, persistence and reload at both widths:
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs --editing
# After restarting the same disposable host:
pnpm --filter @pond/desktop exec node scripts/smoke-web-imports.mjs --after-restart
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs --editing --after-restart
# Live model use; requires the explicitly authorized, connected subscription:
pnpm --filter @pond/desktop exec node scripts/smoke-web-agent.mjs
IRIS_WEB_ORIGIN=https://elkyiem.tailffeb5b.ts.net:9443 pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs --after-restart
```

The parity smoke checks edits/conflicts/Undo, tags, views, Canvas content conflicts,
staged upload retry, package Capture/media retention, CSV and conversion downloads,
attachment registration, video frames, authenticated compatible preview ranges
and image composition. The Canvas smoke renders actual Board tiles to PNG/PDF
and confirms it does not change the saved Canvas.
The package smoke exports the three fixtures over authenticated HTTP, imports
into a new temporary Library, re-exports, deduplicates and reopens it in a second
finite host process. It verifies Capture identity, original bytes, folder paths
and organization names. The live assistant check
uses only disposable fixture metadata and validates persisted sources and tool steps.

Viewer preparation adds twelve tagged Saves through the real upload/import path.
Run it once per fresh disposable Library; subsequent viewer checks reuse its
sandbox manifest. The finite viewer check covers desktop and mobile widths and
writes per-viewer screenshots and `viewer-results.json` under the evidence
directory. HEIC/Office preview and 3D rendering depend on the host platform and
graphics environment; the recorded acceptance run used macOS and Chromium.

The identity smoke prepares a purpose-built logo, verifies upload/normalization,
portable metadata, validation, reset and the public default favicon, and restores
the prior Library logo. Run it before the finite `--identity` browser check,
which uses that fixture with Chromium's real file chooser protocol and verifies
the shared Settings UI, custom tab icon, reload and reset. It restores the prior
logo too. These checks are also part of the isolated CI driver.

## Connect the browser extension to Iris

```sh
pnpm --filter @pond/extension build:iris
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load
unpacked**, and select
`/Users/elkyiem/Documents/GitHub/iris-web/apps/extension/.output-iris/chrome-mv3`.
This build is named Iris and has a separate ID from Pond. Do not change the
installed Pond native-host manifests. Chrome's extension manager must be opened
by the owner because the collaborative browser URL policy blocks that protocol.

Open the Iris extension panel → **Connection**. Enter
`https://elkyiem.tailffeb5b.ts.net:9443` and choose the host's `web-access-key`
file. On the Mac its full path is
`/Users/elkyiem/Documents/GitHub/iris-web/.artifacts/iris-web-sandbox/web-access-key`.
Use Cmd-Shift-G in the file picker to reach the hidden directory. **Connect Iris**
authorizes this extension for this host and Library. The bootstrap key is cleared
after pairing; a separate, revocable credential stays in the extension.

Refresh Iris and any already-open X tab after loading the extension. In Iris,
choose **Sources → New Source → Twitter**. The paired extension uses the X
session in its own Chrome profile; if signed out, it reuses an existing Source
tab or opens one in that browser. Then choose the import scope and start it.
Nothing syncs from a new Account until its import scope is confirmed. A remote
Iris page can also request connection from the paired browser on the Mac; its
worker checks the host every 30 seconds, subject to the existing retry pacing.

Ordinary bookmarks/likes on supported pages use the existing hooks and capture
queue. Scheduled collection remains host-owned, so Chrome need not stay open for
the host to sync an already-connected Account. **Disconnect Iris** revokes the
extension credential; it does not remove Source Accounts already connected on
the host. Disconnect those separately in Sources. An unreachable host must be
reachable again for the panel to revoke its credential. Re-pair after changing
the host address or active Library. Never paste credentials into logs or chat.

Without a paired extension, New Source explains that pairing is required; it
does not automatically open a separate host window. The desktop path remains
unchanged. Do not manually extract browser cookies or repoint the installed Pond
native host. The owner has loaded and paired this Chromium build; live Twitter
connection, a full list walk and a manual duplicate capture passed. Other Sources,
automatic like/bookmark hooks and remote Firefox pairing remain pending.

A first list sync can finish while media are still being processed. Downloads
shows those Save jobs separately. Pond's existing hourly/daily Source budgets
may defer them; leave the host running for their scheduled resume rather than
repeatedly restarting or forcing retries. A successful list walk does not prove
that every original is still available on the Source.

The current direct-download path also has an upstream 50 MiB ceiling even when
the video preference allows larger files. Oversized originals are now classified
as size-limit failures; older stored failures may still say “permanently
unavailable.” Increasing that preference alone does not remove this ceiling.

Finite transport/queue/restart verification, without a live Source session:

```sh
pnpm --filter @pond/desktop exec node scripts/smoke-web-extension.mjs
# Stop and restart only the isolated host, then:
pnpm --filter @pond/desktop exec node scripts/smoke-web-extension.mjs --after-restart
```

The fixture creates a separate temporary extension credential and a generated
image through the existing capture queue. The restart check verifies the Save
and credential survived, then revokes only that test credential. Its private
state file stays in the ignored sandbox with mode 0600 until cleanup.
Run this setup check in a fresh disposable profile before connecting real
Accounts: it assumes no previous pairing and temporarily requests a Source
connection. Do not run it against an active live import.
