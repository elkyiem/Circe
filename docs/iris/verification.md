# Kickoff verification record

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
Iris preserves that upstream behavior; copying a complete Library and importing
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
