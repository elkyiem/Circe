# Iris browser milestone

Status: first host-backed implementation. Upstream baseline: Pond 1.6.3,
`0e9dc817e17baafe60d9151a7fc49be5dc3e0861`.

## Decision

The visiting browser runs Pond's React renderer, components, theme, router,
virtualized Library, search, folder controls and Save viewers. A separate Vite
entrypoint installs a browser implementation of the existing preload contract
before importing the application. The renderer is shared, not copied.

The resident Electron host retains SQLite/Drizzle, portable `.pond` files,
mutation journals, deduplication, durable tasks, utility-process processing,
Capture card rendering, hidden source windows and per-Account sessions. This
milestone requires Electron on the owner's machine; it is not an Electron-free
Node service or an always-on Linux deployment.

A separate loopback Hono listener serves the browser build and `/web` routes.
The browser has an explicit query allowlist independent of Agent discovery.
Existing validated query handlers own reads and folder mutations. Native file
paths, credentials, destructive Library transitions and arbitrary transactions
are excluded. Unsupported actions report a visible capability error. Browser
appearance and navigation preferences are stored on the visiting device.

One Electron host owns all Library mutations and task settlement. Ingest fixtures
supply ordinary structured Capture Seeds to `enqueue`; the existing reconciler,
`capture_tweet`, media fetch, poster and finalize tasks produce real files and
metadata. Fixtures do not prove live platform sync or account authentication.

## Authentication and media

The host creates a random access key in the isolated sandbox with mode `0600`.
It is never bundled, logged or placed in a URL. The visitor supplies it through a
password field or a local file picker. Login creates an opaque, expiring,
HttpOnly, SameSite=Strict cookie; HTTPS origins also set Secure. Sessions are
memory-only and are invalidated by host restart. Logout revokes the session.
Failed login attempts are limited by socket address.

Queries, media and SSE use the same cookie and configured exact origin. Mutations
require the Origin header; foreign origins and mismatching Host headers are
rejected. There is no wildcard CORS. SSE sends SyncActions and connection
heartbeats, removes subscriptions on disconnect, and reloads the pool after a
reconnection gap. Native event sources remain native.

Media routes resolve only indexed files belonging to the requested Save, check
real path containment (including symlinks), and reuse Pond's media handler and
thumbnail selection. MIME types, HEAD, Content-Length, 206/416 responses and
single bounded/open/suffix byte ranges are retained. Browser responses are
private/no-store, carry nosniff and a sandbox CSP, and never expose host paths.
Archive replay and arbitrary `_meta`/`_replay`/video-cache hosts are not exposed.

## Isolation and private access

The launcher requires `POND_SANDBOX`, defaults to the checkout's ignored
`.artifacts/iris-web-sandbox`, and uses Chromium's disposable keychain mode. It
never imports normal Pond sessions. The sandbox owns app-data, Chromium storage,
home/Library, logs and native socket. Upstream sandbox guards suppress protocol
registration, native-host installation, shortcuts and auto-updates. Keep the
normal Pond app installed and its Library closed to this development host.

The listener binds `127.0.0.1:4789` by default. For later private Tailscale access,
terminate HTTPS through a private reverse proxy and set `IRIS_WEB_ORIGIN` to its
exact HTTPS origin while preserving that Host header. Operations, media and SSE
must share that origin. Do not publicly deploy this development host. Remote
Tailscale access has not yet been verified.

## Upstream and later runtime replacement

At kickoff, origin main/dev/web and upstream/main all matched the exact audited
baseline; upstream drift was zero. `main` is the clean fast-forward-only upstream
mirror. Baseline updates flow upstream/main → main → dev → web. Record the new
SHA and drift before each adoption; run upstream checks before adapting changes,
then rerun the web boundary tests and real browser workflows. Completed features
flow web → dev; bring web current with dev afterward. No Iris commit belongs on
main. Preserve Pond's license, copyright, identifiers and serialized formats.

Removing Electron later means replacing concrete host dependencies behind their
owners: session/harvest windows, utilityProcess workers, card rendering, native
media tools, notifications/dialogs and lifecycle services. Move those ports one
at a time, source by source, with compatibility fixtures and queue recovery tests.
Keep the browser transport stable and preserve a single persistence owner.
