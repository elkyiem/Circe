# Kickoff verification record

## Circé extension transport — 2026-10-26

This slice started from local `web` commit `6309ddef`, with a clean working
tree. The pre-change `pnpm check` passed all 25 tasks (4,134 desktop tests).
The audited upstream commit remains
`0e9dc817e17baafe60d9151a7fc49be5dc3e0861`; no newer baseline was adopted.

- Final `pnpm check`: 25 tasks passed; desktop 607 files passed, 2 skipped;
  4,145 tests passed, 5 skipped. Extension transport tests run with the existing
  extension suite. Focused host cases cover credential hashing, 0600 storage,
  restart, expiry, rotation, independent browsers, revocation, exact origins,
  preflight, Library binding, rate limits, forbidden operations and request size.
- `pnpm build`: 11 tasks and all five performance budgets passed. The browser
  build and separate `build:circe` Chromium artifact passed. No dependency was
  added. The Circé build has a separate ID and cannot call the installed Pond
  native host while unpaired; the normal unpaired Pond build retains native
  messaging. Paired network/auth/storage failures cannot fall through to it.
- `smoke-web-extension.mjs`: `WEB_EXTENSION_PASSED` against the real isolated
  host. A generated PNG went through the original durable capture queue into
  the disposable Library. Replies omitted host paths, unsolicited Source-session
  import was rejected, and New Source selected the extension connection mode.
  This passed over both loopback HTTP and the private Tailscale HTTPS address.
- After an actual isolated-host stop/restart,
  `smoke-web-extension.mjs --after-restart` reported
  `WEB_EXTENSION_RESTART_PASSED`: both the capture and extension credential
  persisted. It then revoked its own credential, verified rejection, and removed
  its private 0600 test-state file. No live Source cookies were used.
- CI builds the Circé artifact and includes the first HTTP extension smoke in its
  isolated driver. The complete CI driver was not launched locally because this
  chat uses the single shared host. Restart evidence above is from the explicit
  local stop/restart, not the CI script.
- The finite browser regression passed at 1280×900 and 390×844: real keyword
  search, organization, image viewing, video seeking and reload. A prior run's
  search assertion assumed the video could never match the word “image”; its
  generated caption now contains that word. The driver now assigns a unique
  temporary title term to the image fixture and restores it in `finally`, keeping
  both the positive and negative search checks. No search implementation or
  assertion was weakened. This verifies the ordinary browser application, not
  the uninstalled Chrome extension.
- `--extension-setup` reported `WEB_EXTENSION_SETUP_BROWSER_PASSED`: the actual
  Sources menu and Twitter choice show pairing instructions at both widths when
  unpaired, without creating an Account or opening the separate host sign-in
  flow. The desktop's existing native connection path is unchanged.

At the transport commit, actual Chrome loading/pairing and live X verification
were pending. Computer use rejected opening `chrome://extensions/`: its URL
policy allows only HTTP/HTTPS and forbids alternate automation to bypass that
denial. The built folder and private file-picker instructions were supplied for
manual loading. The owner subsequently loaded and paired it; the live follow-up
below supersedes that pending state. Remote Firefox pairing remains deferred;
its native path is preserved.

Logs: `.local/verification/extension-{baseline-check,check,build,iris-build,
browser-build,http,restart}.log`. Generated files and credential state remain in
ignored directories. The extension transport is reviewable local work on `web`;
it is not promoted to `dev` while the broader acceptance matrix remains pending.

## Live Twitter connection and capture — 2026-10-26

The owner manually loaded the separate Circé extension, paired it with the private
Tailscale host, then chose Twitter in the web app and confirmed the import scope.
The host confirmed one paired browser, imported the requested session into its
isolated Account partition, and matched the expected signed-in handle. No Chrome
profile files were read and the installed Pond native host was not redirected.
The web page was on loopback while the extension was paired to private HTTPS;
the Library-bound polling path successfully delivered this connection request.

- The existing host collector finished its list walk and queued **4,102** live
  Saves. The Account was connected, no longer awaiting import choices, and had
  no sync-level error. This proves list collection/enqueue, not full media ingest.
- Live image/video samples retained matching Save URL, Source ID and structured
  Capture ID. Both native light/dark React cards were present. Authenticated
  original bytes matched the indexed files; unauthenticated media returned 401.
  A video byte-range request returned 206 and the requested 256 bytes.
- In shared Chrome, the original 1280×720 video played and sought to about ten
  seconds of its 10.71-second duration without a media error. A live 1200×630
  original image decoded and remained visible after reload. Screenshots:
  `.artifacts/web-verification/live-twitter-{video,image}-chrome.png`.
- A separate quoted-post sample retained distinct parent/quote IDs and authors.
  Its downloaded clip's yt-dlp asset ID matched the quoted clip; its webpage URL
  matched the parent Save. All four parent/quote light/dark PNGs and original
  video matched authenticated HTTP bytes. The parent PNG visibly contained the
  correct quoted author/content. This sample used Pond's existing actual-X
  screenshot fallback, whereas the image/video samples used native React cards.
  The fallback's video file has no `sourceUrl`; the yt-dlp identity established
  that relationship instead of treating that absent field as a mismatch.
- The installed Circé popup's **Harvest Post → Save** sent an already-saved post
  through the real capture queue. Its persisted receipt completed with
  `duplicateCount: 1` and the original Save ID. A revision-fenced Undo restored
  the original title, notes, rating, tags and user-title lock exactly; no social
  like/bookmark action was made. Private per-item evidence remains ignored in
  the sandbox, outside commits.
- At 19:27 UTC, the Library contained 995 completed Twitter Saves (including
  three existing fixtures), 23 failed live Saves, and 3,087 ingesting live Saves.
  The queue had 7,489 completed tasks, 115 dead tasks and no running task. These
  task counts are not Save counts. Read-only inspection showed `source_budget`
  deferral after 150 hourly permits, with the earliest resume at 19:50:38 UTC.
  The global queue was not paused. The existing governor and recovery schedule
  were left intact; the host was not restarted during the import.

Further read-only inspection matched **all 23 failed Saves** to
`DownloadSizeError` warnings for their captured media URLs. Pond's direct blob
path caps a file at 50 MiB (or a lower configured image limit), then loses that
reason and reports “permanently unavailable.” This does not establish that those
originals were deleted. The follow-up retains `size_limit` through the batch and
task error, with focused tests of an oversized HTTP response and task settlement.
It preserves the ceiling and existing retry/terminal policy. Supporting larger
direct videos while honoring video preferences remains a separate required fix.
The running host and its earlier stored failures have not been rewritten or
restarted to apply that classification change during this import.

Background X requests also emitted 429s, and native
enrichment logged transcript/frame errors on separate items. Full ingest
settlement, automatic bookmark/like hooks, other Sources, and enrichment recovery
remain pending. This is live Chromium/X evidence, not a claim of full parity.

The follow-up exposes the existing Source-budget reason and resume countdown in
Downloads instead of the generic “Waiting for Twitter.” Real Chrome testing
caught the renderer's Save parser discarding that reason; the regression now
passes through the same parser. The accumulated transfer history also squeezed
the download grid to zero height. That panel now has a bounded, keyboard-scrollable
area so active Save jobs retain space. The extension toolbar and popup now derive
their titles from the manifest name so Circé can be distinguished
from the separately installed Pond extension. Normal Pond retains its title.
These title changes take effect when the unpacked extension is reloaded.

At 19:51 UTC the queue had resumed automatically: two tasks were running and
the sync generation had 7,868 completed tasks. No restart, manual retry or budget
change was needed. Full settlement is still pending.

Shared Chrome reloaded the rebuilt app at 1280×900 and 390×844. The Downloads
grid retained about 476 and 408 pixels of height respectively, the transfer
history scrolled independently by keyboard, and the mobile document stayed
390 pixels wide. The mobile table retains its existing horizontal column scroll;
the open Assistant overlay was closed for inspection and restored afterward.
Screenshots: `live-twitter-budget-{desktop,mobile}-chrome.png` in the ignored
verification directory. The temporary viewport override was reset. These are
Chromium viewport checks, not physical-phone coverage.

Focused download-state checks passed 15 tests across two files. Size/transfer
checks passed 13 tests across three files. The full follow-up `pnpm check` passed
25 tasks: desktop 608 test files passed, 2 skipped; 4,149 tests passed, 5 skipped.
`pnpm build` passed all 11 tasks and all five budgets; the browser and separate
Circé extension builds passed. Local logs use `.local/verification/live-source-*`.

## Original kickoff baseline

Environment: macOS arm64, Node 24.14.1, pnpm 11.27.0. The shell initially selected
Node 26 with no pnpm; the existing Node 24 installation was selected explicitly.
Dependencies installed with the frozen lockfile. No baseline upgrade was made.

Before changing shared code, `pnpm check` and `pnpm build` were started from the
untouched audited tree. The full production build passed all 11 tasks and all
five performance budgets. The parallel check/build run suffered test timeouts:
`theme/colors/tokens`, desktop `cli-assistant`, `library-query`,
`queue-v2.simulation`, `bundle-icon`, and `view-store-persistence`. The theme
failure stopped the graph before a complete desktop test summary. These are
baseline observations, not port regressions. No shared tests were weakened.

## Final checks

| Check | Result |
| --- | --- |
| `pnpm build` | Passed 11 tasks and all five existing performance budgets |
| `pnpm typecheck` | Passed all 14 tasks |
| `pnpm lint:repo`, `pnpm oxlint:repo` | Passed |
| `pnpm architecture:check:repo` | Passed across 1,488 desktop modules |
| `pnpm knip:repo` | Passed, with redundant-entry configuration hints |
| Focused web, serialization, byte-range, Capture and media-selection tests | Final run: 31 passed across 7 files |
| `pnpm test` | Default five-second theme contrast timeout, also observed before edits; no clean full-suite claim |
| Theme timeout retry with `--testTimeout=60000` | The failing contrast invariant passed |
| Desktop suite with `--maxWorkers=2` | 595 files passed, 2 skipped; 4,092 assertions passed, 5 skipped; exit failed on an unhandled native socket cleanup ENOENT |
| Native socket test isolated retry | Passed; the affected native server and test are unchanged by this port |

The native socket error concerned a temporary `pond-native-*/native.sock` during
`keeps the replacement socket reachable after the previous listener stops`.
This is an unresolved test-harness race in unchanged code, distinct from the
baseline timeout observations. Neither test timeouts nor shared tests were
changed to obtain a pass. Consequently `pnpm check`/`pnpm test` are not reported
as fully green.

## Real host and browser workflows

The disposable host HTTP smoke passed queue-backed image/video ingest,
card/original file identity, media authentication, HEAD, bounded/suffix ranges,
416, metadata denial, organization, pagination and keyword search. Both UI and
HTTP-created folder membership survived a graceful host stop and restart.

A finite Chromium BrowserWindow loaded the production HTTP app with no preload
bridge, Node integration or existing profile. At 1280×900 it verified the sign-in
hit targets, actual search input, browser fixture enqueue, folder creation,
viewer folder add/remove/re-add, image viewing, video playback/seek and reload.
At 390×844 it verified the library, viewer, decoded video frames and reload.
The media state recorded the original video URL, 640-pixel video width and a
seek past two seconds. Side panes were adapted to overlays at this width.

Stored parent Capture IDs, quoted IDs/authors, source.json and query metadata
were compared. Light/dark card files were both present and distinct; original
image/video source URLs matched the corresponding Capture. Existing Pond media
selection and Capture-to-card tests remain in place. These are deterministic
fixtures, not live Twitter/X verification.

A separate browser run observed the actual `Host disconnected` banner after the
isolated host stopped. SSE tests also verify ready, progress SyncAction delivery
and subscription cleanup. Restart requires signing in again because sessions
are memory-only. Unauthorized operations/media/events and foreign origins were
tested at the HTTP boundary.

Collaborative Chrome exposed a real click blocker on the sign-in form: the empty
application root overlaid it. The form now has an explicit stacking position;
Chrome confirmed that clicking focuses the password input. Private credential
transfer through the browser automation file picker is unavailable without an
extension permission, so a signed-in collaborative Chrome workflow is still a
manual follow-up. No access key was printed or put in browser tool arguments.

Physical mobile devices, live source sessions, Tailscale HTTPS, archive replay,
Agent streaming and visiting-device uploads remain unverified or deferred as
listed in the [parity ledger](parity.md). The resident Electron collectors and
native worker path were preserved; no live account credentials were imported.

Raw local command logs are retained in ignored `*.log` files under
`.local/verification/`. Host test state and generated private credentials are
under ignored `.artifacts/iris-web-sandbox/`; neither belongs in commits.

## Expanded parity slice — 2026-10-26

This record supersedes the earlier kickoff-only limitations where explicitly
stated. Full feature parity is still in progress.

- `pnpm check`: all 25 tasks passed. Desktop: 599 files passed, 2 skipped;
  4,108 tests passed, 5 skipped. Other package checks, including theme, passed.
- `pnpm build`: all 11 tasks and five performance budgets passed. Browser
  production build and all 14 typecheck tasks passed separately.
- Focused transport/security/serialization/history/Agent/native tests: 68 passed,
  1 platform skip across 11 files before the additional reload/preference tests.
  Deep-link and preference regression check: 11 passed across 2 files.
- The native socket cleanup race is fixed. The theme contrast test now runs its
  identical assertions per preset; default timeouts and assertion coverage were
  preserved. A parallel build/check run again timed out in filter persistence;
  its isolated retry and subsequent full graph without a concurrent build passed.
- HTTP workflow smoke passed Save edits and conflicts, stale Undo rejection,
  tags, Saved Views, Canvas rename/content retention and stale autosave rejection,
  upload retry identity, real file import, Pond package Capture/media retention,
  same-Library reimport/dedup, CSV, conversion ZIP, attachment registration,
  decoded/sampled video frames, cross-Save thumbnail rejection and authenticated
  compatible preview byte ranges.
- Private Tailscale Serve HTTPS on port 9443 returned the real app and passed
  authenticated restart/persistence checks from this machine. Existing Serve
  configuration was compared before/after and preserved. No Funnel/public
  deployment was enabled. Another device has not been checked.
- Shared Chrome signed in through its native file chooser without exposing the
  access key. The actual assistant composer used **Codex Default** through the
  authorized ChatGPT subscription, searched the fixture Library, streamed a
  response and cited the correct Save. Opening the citation loaded that Save's
  original `media-1.png`. Folder assignment, removal and saved-item reload passed
  in shared Chrome. Screenshots are ignored local artifacts under
  `.artifacts/web-verification/shared-chrome-{agent,citation}.png`.
- Browser startup testing caught an allowlist mismatch for preferences. Model
  selection testing caught a stale preference publication. Deep-link reload
  testing caught a discarded HTML response body. All were fixed and the latter
  two gained focused regression coverage. HTTP-only checks did not catch them.

The isolated Source sign-in helper is implemented, but no user has completed a
live sign-in. Normal Chrome being signed in to X does not authorize automatic
cookie extraction into the sandbox. Live Source sync is therefore pending.
The available device tool reported a local device-support installation failure
and no Android SDK; physical mobile coverage is not claimed. Archive replay,
Canvas export, host administration, full viewer/format coverage, enrichment
execution ownership, and the remaining Agent review/cancellation/device matrix
remain open in the parity ledger. These are not hidden behind a full-parity claim.

## Canvas, composition and assistant follow-up — 2026-10-26

- The real host rendered a Canvas containing an image Save, note, connector and
  shape beyond the first capture tile to PNG and PDF. The test checks nonblank
  pixels, second-tile color, authenticated download and exact stored-content
  equality before/after. The PNG was visually inspected; an export HUD artifact
  was fixed. Shared Chrome opened the saved Canvas and downloaded its PNG through
  the actual context menu. `scripts/smoke-web-canvas.mjs` repeats the host check.
- Shared Chrome selected the quote and image fixtures, opened the shared Combine
  Images dialog, displayed their original Pond cards and created a new Save.
  HTTP checks also verified export and rejection of a browser-supplied host path.
  At 390×844 the settings and preview remained usable and Export downloaded the
  composed PNG. This is Chromium viewport coverage, not a physical-phone test.
- Shared Chrome stopped a real ChatGPT subscription turn. The accessible status
  now says “Assistant response stopped.” A regression test covers this state.
- Live review testing found an upstream tool returning a pending-review message
  with zero proposals when the model had not read the Save. The tool now reports
  a corrective error, and empty results do not claim a review is ready. The
  failing reproduction and fix are covered by the context test; 47 Agent tests
  passed across context, operations and completion.
- The live review then exposed a null/empty-note mismatch at the executor's
  conflict check. Apply now retains the exact stored original for conflict
  validation and Undo. Regression cases cover null, empty text and a newer note.
  Shared Chrome reopened the persisted review after a host restart, applied the
  fixture note and undid it. Host reads independently verified the applied value
  and exact restoration to `null`.
- Focused web/Canvas/status tests passed: 69 across 12 files. A full graph during
  the render smoke again timed out on the cold filter-store import; its next
  assertion was contaminated by that timed-out import. This is recorded separately
  from the new-feature checks; the final isolated graph result is recorded below.
- Final isolated `pnpm check`: all 25 tasks passed. Desktop: 600 files passed,
  2 skipped; 4,114 tests passed, 5 skipped. Cold dependency loading in the existing
  filter-persistence test moved into setup; every case still resets modules and
  reloads the real store. Default timeouts and assertions are unchanged.
  `pnpm build`: all 11 tasks and five budgets passed.

Screenshots are local ignored artifacts:
`shared-chrome-combine.png`, `shared-chrome-canvas.png`, and
`shared-chrome-agent-stopped.png` under `.artifacts/web-verification/`, with
additional `shared-chrome-combine-mobile.png` and `shared-chrome-agent-applied.png`.

## Directory import follow-up — 2026-10-26

The visiting-device adapter now bounds upload concurrency and retains validated
relative folder names. The host resolves those names to Library folders, never
filesystem locations, and holds transfer admission across creation/import and
assignment. Folder trees and staged-file identities are reused on retry.

- Unit checks cover nested names, retry identity, the host upload admission limit,
  traversal, ambiguous selections and missing destinations.
- `smoke-web-imports.mjs` imported two different originals named `same.png` into
  separate nested folders in the real isolated Library, compared original bytes,
  retried without additional Saves/folders and verified traversal rejection.
- Shared Chrome used the native folder picker and actual Duplicate File dialog,
  selected Keep Both for the two purpose-built files and displayed the complete
  hierarchy. Evidence: `shared-chrome-directory-import.png`. Reload retained the
  data but reset the active folder; that separate navigation gap remains recorded.
- `pnpm check`: all 25 tasks passed; desktop 602 files passed, 2 skipped,
  4,124 tests passed, 5 skipped. Electron-ABI database/vector tests: 8 passed.
- Root production build passed all 11 tasks and five budgets. The native desktop
  smoke passed visible startup, preload operations and detached preview with
  `--use-mock-keychain`. Its first invocation without that sandbox flag stalled
  before readiness and was terminated; no normal keystore access was approved.
- Directory Save identities and memberships survived the same host's restart.
  The finite browser again showed the disconnection banner when the host stopped.
  An initial manually orchestrated attempt missed its 20-second stop window;
  stopping directly when the readiness signal arrived passed without test changes.

## Browser scope restoration — 2026-10-26

The active-folder reload gap is fixed. Shared Chrome verified folder reload,
opening and reloading an imported Save, app Back/Forward and browser Back between
All and the selected folder. The correct two contents and subfolders returned.
Screenshot: `shared-chrome-folder-reload.png`. The finite desktop/mobile browser
smoke also passes folder reload through the real UI. Its first extended run
needed a null guard while waiting for the reloading breadcrumb to mount.

History tests cover Folder/Tag restoration, encoded tag names, Save context,
unrelated application routes, explicit scope, and invalid/ambiguous parameters.
`pnpm check` passed all 25 tasks: desktop 603 files passed, 2 skipped; 4,127 tests
passed, 5 skipped. The production build passed all 11 tasks and five budgets;
the browser build passed separately. Saved View and complete filter-history
restoration remain a further navigation slice.

## Fresh-Library package round trip — 2026-10-26

`smoke-web-package.mjs` downloaded a real authenticated browser export containing
the quote, image and video fixtures. A finite Electron process imported it into
a new temporary Library, compared every Capture and indexed-file record, and
hashed every original and derived file. Re-export retained each Save's folder
paths and the organization names. Reimport skipped all three existing Saves;
a second host process reopened the same temporary Library and verified stable
destination IDs and file bytes again. Both temporary profiles and their packages
were removed after the processes exited. No production data or credentials were
copied. The initial test bundle needed to reside in the workspace cache for
package resolution; this was a harness issue before import ran.

Pond's existing package importer assigns destination Save/Folder IDs and remaps
their references. Source IDs and structured Capture identities are retained.
Circé preserves that upstream behavior; copying a complete Library and importing
a package are different operations. This check does not claim every organization
attribute or foreign import format has a browser acceptance test.

## Representative file viewers — 2026-10-26

Twelve purpose-built files entered the isolated Library through authenticated
upload and the original importer: HEIC, PDF, WAV, WOFF2, Unicode text, EPUB, GLB,
ZIP, Live Photo, offline HTML, DOCX and a generic original. All twelve rendered
their actual registered viewer at both 1280×900 and 390×844; a fallback would fail
the check. PDF text search and rotation, audio playback, Live Photo motion and
seeking, font loading, EPUB content, 3D rendering, ZIP entries, sanitized sandboxed
HTML and byte-exact generic downloads passed. Native-preview coverage is specific
to this macOS host. This is representative coverage, not every supported file
format or viewer control; WARC replay remains a separate deferred boundary.

The browser now labels the original-file action **Download Original**; native
Open in Default App and Export Original remain on desktop. PDF HUD controls no
longer overlap when the center slot is empty: narrow toolbars retain every
control in a horizontally scrollable end slot. Both widths exercised rotation
through that toolbar. Shared Chrome independently confirmed PDF search; the
finite test initially omitted the Return character event, which was corrected
in its input harness without changing product search behavior.

The finite viewer matrix passed all 24 cases. The original browser workflow
also passed against the expanded Library, including search, full-image decoding,
video seeking, folder mutation/reload and mobile width. Its locators now handle
virtualized results and distinguish the open Save's original from the retained
Library grid's thumbnails. Evidence: `viewer-results.json` and
`viewer-<kind>-<width>.png` under `.artifacts/web-verification/`.

The final `pnpm check` passed all 25 tasks: desktop 603 test files passed,
2 skipped; 4,127 tests passed, 5 skipped. `pnpm build` passed all 11 tasks and
five performance budgets. The separate production browser build and focused
viewer tests also passed.

## New Note and editor persistence — 2026-10-26

The real New Note menu exposed a transport regression: the browser upload/manual
adapter dropped `mediaType`, so Pond rejected an untitled empty text Save as
empty input. The adapter now reuses the native manual-input schema and
normalization, replacing only filesystem paths and Source identity with
host-resolved upload tickets. Three focused tests verify empty Notes, media
metadata, upload identity and rejection of host paths or expired tickets.

The finite browser created Notes through New, edited their titles and Unicode
bodies in Pond's actual Lexical editor, independently checked committed Save
fields over HTTP and reloaded the Save at both 1280×900 and 390×844. The mobile
flow opens the existing sidebar to reach New and closes it to edit. Early harness
runs needed to await creation, open that sidebar and explicitly navigate to All
instead of invoking the Continue startup route. No product navigation behavior
was changed to satisfy those harness corrections.

Evidence: `editing-results.json`, `note-edited-<width>.png` and
`note-reloaded-<width>.png`. These Notes have not yet received a separate host
restart acceptance run; the fixture manifest and `--editing --after-restart`
command are prepared for the next shared-runtime restart. Rich formatting,
conflicting concurrent document edits and the full bulk-edit UI matrix remain
pending. `pnpm check` passed all 25 tasks: desktop 604 files passed, 2 skipped;
4,130 tests passed, 5 skipped. The root build passed all 11 tasks and five budgets.

## Library logo and browser tab icon — 2026-10-26

The owner reported a generic browser-tab icon and “Couldn't choose the logo.”
The browser document had no favicon, and both logo operations remained classified
as native-only. The browser now opens its own single-file picker and uploads an
opaque ticket. Main uses the same native image normalization as desktop;
the existing identity owner stores the 256×256 PNG in portable metadata.
Identity writes retain the current session, origin and Library fences. The
browser starts with Pond's upstream default app icon and follows the custom
Library logo after authenticated reads or updates; Reset restores the default.

- Focused checks: 22 tests across five files passed, including actual browser
  picker/change/cancel events and host authentication/origin/Library checks.
- The real isolated-host HTTP smoke verified PNG dimensions, stored metadata,
  reset/restoration, rejection of invalid images, host paths and oversized files,
  and the declared favicon's MIME type and image bytes.
- The finite Chromium browser used the real file chooser protocol and shared
  Settings UI to upload, display, reload and reset the logo. The custom favicon
  matched the stored logo after upload and reload. Original identity was restored.
  Evidence: `library-logo-changed.png`, `library-logo-reloaded.png` and
  `library-logo-reset.png`. Both identity checks now run in the isolated CI driver.
- Shared Chrome reached Settings, but its native access-key chooser left Open
  disabled. It was cancelled; no browser permission was changed. Complete logo
  UI acceptance therefore used the finite Chromium check above. The owner's
  remote Windows logo-picker result remains distinct from that automated proof.
- `pnpm check`: all 25 tasks passed; desktop 605 test files passed, 2 skipped;
  4,134 tests passed, 5 skipped. Root build: all 11 tasks and five budgets passed;
  the separate browser production build passed.

The necessary isolated-host restart also completed the pending Note restart
check: both previously edited Notes reopened with identical titles and bodies
at desktop and mobile widths (`WEB_EDITING_RESTART_PASSED`). Separately, the
owner confirmed remote Windows access through Tailscale after explicitly
authorizing private Taildrop delivery of the login file. No key contents were
printed, embedded in a URL or committed.

The Note acceptance assertions passed before its temporary Chromium profile
cleanup stalled two older finite processes in a native error dialog. Those
test-only processes were stopped; the shared host remained running. Profile
removal now retries transient filesystem failures and reports a failed cleanup
with a nonzero exit instead of opening an uncaught-error dialog. The Note
restart check was repeated and exited successfully with the profile removed.

## Pond 2.0 and Circé rename — 2026-10-27

Synced upstream `main` through `c594ed4d`, including release tag `v2.0.0`.
Renamed the GitHub fork to `elkyiem/Circe`, the project and checkout to Circé,
and the browser/extension branding to Circé. The isolated profile's three stored
checkout-path records were relocated with backups. Existing session namespaces,
Library identity and extension signing key remain compatible.

Verification from `/Users/elkyiem/Documents/GitHub/Circé`:

- `pnpm install --frozen-lockfile`: passed with Node 24.14.1 / pnpm 11.27.0.
- `pnpm check`: all 27 tasks passed; desktop 664 files passed, 4,585 tests passed,
  5 skipped (including the separately checked native database cases).
- `pnpm build`: all 12 tasks passed, including every unchanged performance budget.
- `pnpm --filter @pond/desktop build:web`: passed.
- `pnpm --filter @pond/extension build:circe`: passed; manifest name Circé,
  version 2.0.0, existing extension signing identity retained.
- Electron ABI database/vector checks: 2 files and 8 tests passed.
- `smoke-agent-stream.cjs`: passed reply streaming, completion and cancellation.
- `smoke-desktop.cjs --use-mock-keychain`: passed visible startup, preload Library queries and detached preview creation/cleanup with an isolated test Library. The mock keychain avoids a macOS authorization dialog during this finite check.
- Portless forwarding tests cover authenticated uploads, media ranges, cookie
  retention and foreign Host/Origin denial. Browser Data Export picker and
  Library-bound Fish handoff regression cases are part of the offline suite.

The shared Circé host and Tailscale were stopped at inspection. Live browser,
physical-device, new Source sign-ins and short-address activation require the
designated runtime owner. The local Portless/HTTPS forwarder does not configure
DNS or certificates on an unvisited remote device.

## Runtime activation follow-up — 2026-10-27

The user explicitly designated this chat runtime owner. The existing Library
opens after the checkout relocation, and authenticated reads, Fish settings,
MCP settings and the private HTTPS session at
`https://elkyiem.tailffeb5b.ts.net:9443` passed. The host runs independently of T3;
its PID and logs are under ignored `.artifacts/circe-runtime/`.

- The authenticated HTTP workflow passed image/video ingestion and identity,
  media byte ranges, pagination, search, Folder assignment and restart retention.
- The real browser workflow passed over loopback and private Tailscale HTTPS at
  1280×900 and 390×844, including image
  rendering, video seeking, Folder assignment/removal, browser navigation and reload.
- Smoke scripts now retain old fixture titles and find fixtures outside the newest
  100 Saves. Their Folder selectors follow Pond 2's accessible menu roles.
- The CI failure on the renamed extension output was traced to one stale
  `.output-iris` path; it now reads `.output-circe`.
- Portless 0.15.11 rejects `--tld` on its app command. A cross-platform Node
  launcher now provides `PORTLESS_TLD=elkyiem` and the `circe` app name.
- The network smoke reproduced a real Unicode User-Agent failure after the Circé
  rename. The host keeps the accented display name and sets an ASCII `Circe`
  HTTP token before creating sessions. The regression fetches an actual image
  through Electron's `pond://` handler, passed after the fix, and is included in the CI driver.

After the owner approved the native certificate dialog, `https://circe.elkyiem`
became active on this Mac. Portless runs on loopback port 443, the local hostname
resolves to loopback, and macOS certificate verification and ordinary `curl` both
pass. The browser workflow passed at desktop and mobile widths through this
trusted short address, including video seeking and reload persistence. Node-side
fixture requests use the same `NODE_EXTRA_CA_CERTS` setting supplied by Portless;
Chromium page loads use macOS certificate trust.

Portless also publishes the private address
`https://elkyiem.tailffeb5b.ts.net:8444`. The existing private HTTPS route on port
9443 remains active. All prior Serve routes and Funnel settings were verified
unchanged. Temporary administrator credential delivery files were removed after
use. Shared tailnet access was completed in the follow-up below.

After the network fix, `pnpm check` passed all 27 tasks (4,585 desktop tests),
`pnpm build` passed all 12 tasks and budgets, the browser bundle rebuilt, and the
network smoke passed. The independent host was restarted from those bundles;
authenticated private-HTTPS restart and browser checks passed again, and the
new runtime log contains no ByteString header errors.

A later Ubuntu CI run exposed a case-sensitive media lookup failure. Chromium
lowercases standard-scheme authorities, but Save directories retain uppercase
ULIDs. The protocol now restores valid Save ULIDs before resolving media and
thumbnails. The existing network smoke was run against a temporary case-sensitive
HFS+ volume on macOS: it reproduced `404 !== 200` before the fix and passed after
the fix. That volume was detached and removed. The production build passed all
12 tasks and size budgets, and the shared Portless host was restarted from the
rebuilt bundles. Authenticated media ranges, folder/search operations, private
HTTPS persistence, and normal macOS certificate verification passed again.
`pnpm check` passed all 27 tasks again, with 4,585 desktop tests passed and
5 skipped.

## Shared tailnet DNS and HTTPS — 2026-10-27

The short addresses now work through the Mac's Tailscale IP instead of requiring
a Portless process on each visiting device. The owner installed the public CA
on Windows and confirmed that `https://circe.elkyiem` loads there.

- CoreDNS 1.15.0 serves the private `elkyiem` zone on `100.88.201.56:53`, with a
  wildcard A record pointing to the Mac. UDP and TCP lookups passed; AAAA queries
  return empty NOERROR responses, and unrelated DNS zones are refused.
- Tailscale split DNS was patched only for `elkyiem`. Other split-DNS namespaces,
  global nameservers, and MagicDNS preferences were read before and after and
  verified unchanged. Queries through Tailscale's resolver at `100.100.100.100`
  return `100.88.201.56` for both `circe.elkyiem` and `nono.elkyiem`.
- HAProxy 3.4.7 routes TLS connections from Tailscale TCP port 443 through the
  existing Portless proxy for `.elkyiem` names. Other hostnames retain the prior
  HTTPS handlers, moved behind the gateway to port 9445. Every previous web
  handler was compared with the resulting configuration. Other ports and Funnel
  settings were retained. The original default target returned 502 before the
  change, and its response remained identical afterward.
- Trusted HTTPS requests for both short names passed when explicitly connected
  to `100.88.201.56`. The desktop/mobile browser smoke also passed with Chromium
  resolving Circé to that Tailscale IP: image rendering, video seeking, folders,
  navigation, reload, and folder persistence.
- CoreDNS and HAProxy run under dedicated launchd jobs. Both reported running;
  DNS binds only to the Tailscale IP and the TLS gateway only to loopback. The
  firewall remains enabled, with the CoreDNS executable allowed. Runtime
  configuration and logs live outside the repository checkout.
- The routing helper uses LocalAPI concurrency tokens, retains backups, and its
  rollback transformation was checked against the original configuration plus
  a newer unrelated route. This check did not change live routing.
- Temporary administrator-password and Tailscale API-token delivery files were
  removed after use. Public Windows/iPad certificate artifacts remain available
  under `.artifacts/circe-device-setup/`.


## Main-to-web sync — 2026-10-28

Merged the 12 new `main` commits through `d949c928` into `web`. At the time of
verification, `origin/main` and `upstream/main` both pointed to that commit.
The merge retained Circé's download-size diagnostics alongside upstream's image
validation tests. The refresh sign-in notice reads a loaded Save's Source through
an explicit Saves entrypoint, satisfying the feature ownership check.

The new native Safari operations are classified as host-only. A regression test
first reproduced the visiting Mac browser showing Safari controls, then passed
after those controls were restricted to the desktop runtime. Boundary tests also
reject all three native Safari queries and verify that `pipeline:refresh-blocked`
reasons survive the authenticated SSE stream. Upstream's notice tests cover the
sign-in action, retry after connection, and unloaded Saves.

- `pnpm check`: all 27 tasks passed; desktop 668 files passed, 4,627 tests passed,
  5 skipped.
- `pnpm build`: all 12 tasks and existing performance budgets passed.
- `build:web` and the Circé extension build passed.
- `smoke-desktop.cjs --use-mock-keychain` passed with a temporary isolated Library.
- React Doctor changed-scope scans before and after the compatibility fixes both
  scored 90/100 with the same three advisories. The small media-kind lookup,
  sequential Safari probes and intentionally bounded embedding batches were
  reviewed; they did not identify a browser regression requiring a behavior change.
- The designated runtime owner restarted only the shared Circé host from the
  rebuilt bundles, preserving its sandbox. The authenticated restart check passed,
  followed by image/video byte ranges, pagination, search and Folder operations.
- The real browser smoke passed at 1280×900 and 390×844, with Circé explicitly
  resolved to the Mac's Tailscale IP. Image rendering, video seeking, Folder
  assignment/removal, navigation and reload persistence passed.
- Trusted HTTPS requests for Circé and Nono through `100.88.201.56` both returned
  200. The complete Tailscale Serve configuration before and after the host
  restart was identical; shared DNS, gateway and certificate setup were retained.

Local logs are `/tmp/circe-main-sync-{check,build,web-build,extension-build,
react-doctor,desktop-smoke,web-restart,web-http,web-browser}.log`. Physical Windows
and iPad acceptance of these new application changes was not repeated. Source
sign-ins and external network harvests remain separate from these offline checks.
The [sync process](sync.md) records the repeatable commands and a proposed sync-PR
workflow; no automatic updater or deployment was enabled.

## Pond 2.0.1 sync — 2026-10-28

Merged 19 new upstream commits through `029bfcb1`, including release `v2.0.1`.
The browser retains its transport and Circé branding. Refresh sign-in notices
now use upstream's public Saves pool entry, replacing the temporary lookup
helper added during the previous sync.

- The new browser adapter regression first failed because `machinePace` was
  missing. It now verifies unavailable thermal telemetry, local native-client
  detection, prompt-signal loading without a host app probe, and the version
  derived from the desktop package. Host boundary tests reject the native MCP
  client query over HTTP.
- The real browser run exposed an upstream keyboard regression: the global
  capture handler swallowed field and widget keys, so Escape did not close the
  Folder picker. A test reproduced the lost Enter/Escape events. The guard now
  stops propagation at the document bubble phase, allowing local field and
  document widget handlers to run before blocking window app shortcuts. All
  14 focused app-hotkey tests pass, retaining typing and search coverage.
- The smoke runner dismisses first-launch prompts through the actual Escape
  interaction and captures them as evidence. It does not suppress the product's
  prompt logic or follow external voting/share actions.
- `pnpm install --frozen-lockfile` passed, including the new video workspace.
- Final `pnpm check` passed all 28 tasks: desktop 678 files passed, 4,693 tests
  passed and 5 skipped.
- `pnpm build` passed all 12 tasks and the upstream performance budgets. The
  initial build exceeded the main startup budget; the optional native updater
  now loads at app readiness outside the sandbox, retaining the 3,200,000-byte
  limit. The final main static graph is 3,120.6 KiB against a 3,125.0 KiB limit.
- The browser and Circé extension builds passed. The extension manifest retains
  the Circé name and signing identity, with version 2.0.1.
- Native database/vector checks passed both files and all 8 tests. The protocol
  network smoke passed with the accented display name and ASCII HTTP headers.
  The final desktop startup/preload/preview smoke passed with a temporary
  isolated Library and mock keychain.
- React Doctor changed-scope scans before and after the compatibility fixes
  both scored 84/100 and reported no new diagnostics.
- The designated owner restarted the shared host with its existing sandbox.
  Authenticated restart retention, media ranges, pagination, search and Folder
  operations passed. The actual browser workflow passed at 1280×900 and 390×844
  through the Mac's Tailscale IP, including Folder assignment/removal, Escape
  dismissal, image rendering, video seeking, navigation and reload persistence.
- Circé and Nono both returned trusted HTTPS 200 through `100.88.201.56`.
  The full Tailscale Serve configuration before and after the update was
  identical. DNS, certificate trust and the shared gateway were retained.

Local logs use `/tmp/circe-201-*.log`. Live Source sign-ins, the new sensitive
model's network download/inference smoke, and physical iPad/Windows acceptance
were not repeated. The sync automation proposal remains unimplemented.
