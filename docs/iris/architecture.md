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
Existing validated query handlers own domain operations. The exhaustive query
and bridge classifications require a deliberate decision for every desktop
addition; classification alone does not mean a workflow has been verified.
Native paths, credential reads, destructive Library transitions and arbitrary
transactions are excluded. A bounded Save-edit endpoint checks original values
before committing through the executor and journal. Undo/Redo submit the observed
host-global history revision and reject a different history head. Device
presentation preferences overlay host preferences without replacing provider,
processing or storage settings.

Browser history carries Folder/Tag and ordinary Library scopes in URLs and
restores them through the existing Library state owner. Save URLs retain their
originating scope across reload. Browser toolbar navigation uses browser history;
the desktop keeps its existing memory history and Folder navigation behavior.

One Electron host owns all Library mutations and task settlement. Ingest fixtures
supply ordinary structured Capture Seeds to `enqueue`; the existing reconciler,
`capture_tweet`, media fetch, poster and finalize tasks produce real files and
metadata. Fixtures do not prove live platform sync or account authentication.

## Authentication and media

The host creates a random access key in the isolated sandbox with mode `0600`.
It is never bundled, logged or placed in a URL. The visitor supplies it through a
password field or a local file picker. Login creates an opaque, expiring,
HttpOnly, SameSite=Strict cookie; HTTPS origins also set Secure. Sessions are
memory-only and are invalidated by host restart. Logout revokes the session and immediately closes its event subscriptions.
Sessions are bound to the origin and active Library. Writes also send the Library
identity and revalidate it inside the mutation scope.
Failed login attempts are limited by socket address.

Queries, media and SSE use the same cookie and configured exact origin. Mutations
require the Origin header; foreign origins and mismatching Host headers are
rejected. There is no wildcard CORS. SSE sends SyncActions, connection heartbeats
and an explicit set of session, Source sync, preferences, transfer and Agent
notifications. Subscriptions are removed on disconnect; reconnecting after a gap
reloads the pool. The Agent endpoint wraps the existing AI SDK stream and stops
the exact chat/request on cancellation. Provider clients and Codex subscription
authentication remain on the host.

Media routes resolve only indexed files belonging to the requested Save, check
real path containment (including symlinks), and reuse Pond's media handler and
thumbnail selection. MIME types, HEAD, Content-Length, 206/416 responses and
single bounded/open/suffix byte ranges are retained. Browser responses are
private/no-store, carry nosniff and a sandbox CSP, and never expose host paths.
Frame extraction and compatible previews reuse host FFmpeg processing. Preview
URLs are bound to an indexed original and active Library, with authenticated
range delivery. Arbitrary `_meta`, `_replay` and video-cache paths remain blocked.
Archive replay is still deferred until its separate-origin isolation is proven.

Visiting-device files are streamed to bounded, Library-bound staging using opaque
tickets. Existing importers own persistence and duplicate handling; replaying one
staged file import preserves its Save. Directory picks carry validated relative
names, resolved to Library folders through the existing folder owner. These
names are never used as host filesystem paths. Retried trees reuse folders by
name and parent, and uploads are bounded below host admission limits. Folder
creation, imports and membership stay inside one Library transfer so switching
must wait for settlement. Existing export operations produce
host-owned downloadable artifacts. ZIP is a transport envelope around the Pond
package, not a new Library format. Extraction rejects traversal and symlinks and
bounds expanded bytes. Conversion exports finish on the host and become
session-authenticated downloads. Clipboard and sharing act on the visiting device.

Canvas autosaves compare a hash of the content read by the client, inside the
mutation scope. Concurrent renames do not overwrite content, and a stale board
cannot replace another window's changes. Browser PNG/PDF export sends a validated
snapshot to one dedicated hidden Electron window. Its restricted preload can
read only snapshot Saves and capture rectangles inside that window. It reuses
Pond's Board, font loading and tiled renderer; it cannot mutate the Canvas or
capture the unrelated visible host window. Export retains the visiting device's
resolved theme. Native desktop export keeps its existing path.

Combine Images opens the same lazy-loaded component in a browser dialog. Create
uses the existing host compositor; Export returns an authenticated download.
The browser never supplies an output path on the host.

Source connection opens an isolated, sandboxed host window with no preload or
Node access. Only cookies entered in that window reach the existing session
importer. It does not inspect or copy Chrome profiles and does not redirect the
installed Pond native host. No live Account has completed this flow yet.

The browser Library-logo picker uploads one visiting-device image using the same
Library-bound tickets as file import. Main applies the native desktop logo
normalizer and returns Pond's existing 256-pixel PNG data URI. The existing
identity mutation writes portable Library metadata within the mutation scope.
No host path picker, arbitrary file read or Library lifecycle operation is
exposed. The browser document declares the upstream default app icon before
sign-in; authenticated Library reads and logo updates set the tab icon to the
custom Library logo. Reset restores the default.

## Isolation and private access

The launcher requires `POND_SANDBOX`, defaults to the checkout's ignored
`.artifacts/iris-web-sandbox`, and uses Chromium's disposable keychain mode. It
never imports normal Pond sessions. The sandbox owns app-data, Chromium storage,
home/Library, logs and native socket. Upstream sandbox guards suppress protocol
registration, native-host installation, shortcuts and auto-updates. Keep the
normal Pond app installed and its Library closed to this development host.

The listener binds `127.0.0.1:4789` by default. `IRIS_WEB_ORIGIN` and the optional
comma-separated `IRIS_WEB_ORIGINS` explicitly name accepted origins. A reverse
proxy must preserve Host; each request's Origin must match that Host's configured
origin. HTTPS sessions use Secure cookies. Arbitrary forwarded headers are not
trusted. The development host is privately reachable through Tailscale Serve on
HTTPS port 9443. Same-machine tailnet HTTPS authentication and restart checks
passed; the owner also confirmed access from remote Windows after private
Taildrop delivery of the access-key file. Existing Serve routes were preserved.
Never use Funnel or publicly deploy this development host.

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
