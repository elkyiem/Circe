# Circé browser milestone

Status: native-backed browser implementation. Upstream baseline: Pond 2.0.1,
including upstream `main` through `029bfcb1` (2026-10-28). The usage target is one
active device at a time; stale tabs still cannot overwrite a newer Library state.

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
HttpOnly, SameSite=Strict cookie; HTTPS origins also set Secure. Only session digests are persisted in a private 0600 file, bound to the current
access-key identity and expiry. Restart restores valid sessions for the same
Library; rotation and Library changes invalidate them. Logout durably removes the
session and immediately closes its event subscriptions.
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
Archive replay uses per-session random origins under replay.elkyiem, a sanitized
WARC derivative and a pinned, read-only replay worker. The original archive stays
unchanged. Trusted Circé UI confirms external links; replay origins cannot access
application sessions or general APIs.

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

The extension can pair with an exact Circé address and Library. Its existing
capture tools, Source hooks, cookie API and session scheduler then use a narrow
HTTP adapter instead of native messaging. A separate unpacked Circé build has its
own extension ID, leaving the installed Pond extension and native host intact.
An unpaired standard Pond build retains native messaging. A paired request never
falls through to another local Library after a network or authorization failure.

The access-key file bootstraps pairing over HTTPS (or host loopback HTTP). The
extension stores only the resulting connection credential in extension-origin
IndexedDB; the host persists its digest with mode 0600. Credentials expire after
90 days and bind the extension origin, exact host origin and Library. Separate
browsers have separate credentials. Disconnect revokes that browser's credential;
authenticated `/web/extensions` DELETE revokes the current Library's extension
credentials. Extension credentials cannot authorize renderer, media, file or
arbitrary query routes. Pairing is rate limited, CORS permits pinned Chromium
extension IDs, and messages retain the existing native schemas and 8 MB limit.
An exhaustive access classification makes new upstream native operations require
an explicit remote-access decision before the host can compile.

After **New Source**, the browser notifies the extension through a credential-free
page message. The background checks the sender against the paired Circé origin
and checks that the host is waiting for that Source. Only then does the existing
cookie API send that Source's session to the original importer. A host poll also
supports connecting from a different device. Session imports without an explicit,
current Library-bound request are rejected. No Chrome profile files are read.
Captures reuse the durable capture queue, Library transfer owner and original
processing pipeline. Host filesystem paths are removed from extension replies.

When no extension is paired, the browser reports that pairing is required;
it no longer automatically opens a separate host sign-in window. The original
desktop sign-in path is unchanged. The owner loaded and paired the Chromium
build, then connected Twitter through the browser. The isolated host imported
the requested session and queued 4,102 live Saves. Actual Chrome capture/dedup,
original image/video delivery and quoted-content identity were checked separately
from fixtures; the full ingest and other Sources remain unverified. Firefox's
native path remains available; remote Firefox
pairing is deferred until its per-install extension-origin behavior is verified.

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
home/Library, logs and native socket. Explicit host font activation uses the real
OS user Fonts directory; all other Library isolation remains in that profile. Upstream sandbox guards suppress protocol
registration, native-host installation, shortcuts and auto-updates. Keep the
normal Pond app installed and its Library closed to this development host.

The listener binds `127.0.0.1:4789` by default. `CIRCE_WEB_ORIGIN` and the optional
comma-separated `CIRCE_WEB_ORIGINS` explicitly name accepted origins. A reverse
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
flow web → dev; bring web current with dev afterward. No Circé commit belongs on
main. Preserve Pond's license, copyright, identifiers and serialized formats.

Removing Electron later means replacing concrete host dependencies behind their
owners: session/harvest windows, utilityProcess workers, card rendering, native
media tools, notifications/dialogs and lifecycle services. Move those ports one
at a time, source by source, with compatibility fixtures and queue recovery tests.
Keep the browser transport stable and preserve a single persistence owner.

## Pond 2.0 and Circé addresses

Fish and MCP settings use the same validated host queries as desktop. Fish
presence and capture navigation cross the authenticated SSE channel; a browser
capture keeps its Library binding and opens Fish in the browser instead of
activating a desktop window. Bluesky public likes use the host's handle connector;
its bookmark sign-in remains an explicit host window. Data Export ZIPs follow the
existing bounded, opaque upload-ticket route before entering Pond's archive reader.

Portless injects the assigned port, local HTTPS origin and private Tailscale
origin before host startup. `web/config` validates each exact origin; it never
accepts wildcard origins or trusts forwarded-host headers. A visiting device may
run a loopback Portless forwarder to the host's Tailscale HTTPS URL. That adapter
validates the short Host/Origin, rewrites them to the exact upstream origin and
streams requests and responses without reading credentials into application code.
The previous `IRIS_WEB_*` environment names and stored protocol namespaces remain
compatible after the Circé rename.

The Circé host retains its accented display name while its Electron fallback
User-Agent uses the ASCII token `Circe`. Chromium's protocol bridge otherwise
rejects renderer requests before they reach `pond://` media handlers. The network
smoke verifies this boundary using an actual generated image in a temporary Library.


## Durable browser transfers and device handoff

`web/transfers.ts` adapts the native durable transfer owner rather than creating a
second queue. Jobs retain their originating Library identity. Ordinary legacy native jobs keep
the desktop path-based retry policy; browser requests and web staging jobs
require an explicit saved Library identity. Browser export jobs
include ZIP packaging and a validated download receipt before reaching Completed;
retry reconstructs only the artifact directory whose Library/kind/device/inode
marker matches that job. A completed job can be downloaded again after reload.
`core/transfer-delivery.ts` registers the resident delivery owner so desktop Retry
uses the same preparation and settlement hooks; desktop download uses native Save
As, while browsers receive authenticated URLs without host paths.

`web/package-import.ts` retains a private raw ZIP hardlink and an atomic expanded
source marker across failure, cancellation and host restart. Unpacking occurs
inside the native job's cancellable operation. Successful jobs retire their owned
source after settlement; failed jobs retain it for Retry. Streaming ZIP64 output
and bounded random-access extraction avoid buffering the entire archive. Each
owner closes its streams and removes only its own partial files. Resource-aware
upload/extraction admission preserves disk headroom instead of imposing the old
256 MiB upload and 1 GiB expansion ceilings. Browser references release uploaded File
bytes while retaining their idempotent ticket and relative name.

Interface zoom belongs to the visiting device; host window flags remain native
preferences. Canvas camera math normalizes CSS interface scale before persisting
world coordinates. Shared dialogs remain within the current viewport at 200% zoom.
The production connection/debug bar is hidden once connected; fixtures are opt-in.

The PWA caches only its reconnect explanation and one public app icon. It does not
replicate the Library or accept offline writes. Navigation network failures and
proxy 5xx responses show the reconnect page; the Mac must be awake and reachable
through Tailscale. A temporary host failure does not pretend that the session has
expired or ask for a new access key.
