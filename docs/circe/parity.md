# Feature parity ledger

Baseline: Pond 2.0.1 plus upstream `main` through `029bfcb1` (2026-10-28).
Long-term objective: every Pond workflow from desktop and mobile browsers.
The native-backed browser workflows and production PWA are deployed. The target is
one active device at a time, with the Mac retaining the authoritative Library.
An exposed operation is not verification evidence; physical Windows and iPad
acceptance remain separate from macOS Chromium tests.

| Capability | Execution owner | Demonstrated coverage / remaining work |
| --- | --- | --- |
| Pond renderer, components, design system | Browser | Shared production entrypoint; no copied application or replacement UI kit |
| Library, pagination, keyword search | Host + browser | Real Library and existing virtualized components; finite browser search passed |
| Title/notes/rating and bulk edits | Host | Bounded transaction schema; HTTP edit, stale edit rejection, grouped history and stale Undo rejection passed; broader UI matrix pending |
| New Note and text editor | Browser + host | Real New Note menu, title/body editing, reload and host restart passed at 1280- and 390-pixel widths; manual-input transport retains the explicit text type; richer editing and concurrent document checks pending |
| Folders, tags, groups, rules, Saved Views | Host | Existing domain operations exposed; HTTP folder/tag/view CRUD passed; shared Chrome folder assignment/removal/reload passed |
| Canvas CRUD, autosave and export | Host + browser | HTTP CRUD, rename retention, serialized autosave and stale desktop/browser writes passed; dedicated native render job exports PNG/PDF with actual Board tiles. Real 150% interface-scale tile drag, camera pan and reload retained exact world coordinates; broader board-tool and physical-device coverage remains separate |
| Image/video viewing and seeking | Host media + browser | Actual shared viewers and original media; authenticated HEAD, 206/416 and byte ranges verified |
| PDF, audio, fonts, text, EPUB, 3D, ZIP, Live Photo, HTML and native previews | Browser + host processing | Twelve representative viewer fixtures passed at 1280- and 390-pixel widths; PDF search/rotation, audio playback, Live Photo seeking, HTML isolation and original download checked; broader format/control/device matrix pending |
| Video frames and compatible previews | Host FFmpeg | HTTP decoded frame, sampled frames, cross-Save thumbnail rejection and Save-bound preview ranges passed; clipboard/frame UI matrix pending |
| Visiting-device upload/import | Browser + host | Bounded uploads and Library-bound tickets; nested folder and same-name originals retained, request retry reuses Saves/folders, traversal denied; real Chrome picker and duplicate-review import passed; interruption matrix pending |
| Pond packages, original files and CSV | Host + browser download | ZIP envelope, Capture identity, original bytes, same/fresh-Library dedup, folder paths, organization names, re-export and second-process restart passed; artifact auth/ranges and CSV verified |
| Eagle/bookmarks/Mymind import | Host | Real Eagle folder selection, nested/Unicode/empty files, original checksums, native metadata/progress and repeat deduplication passed. HTML/Chromium JSON bookmarks and Mymind ZIP passed four real groups covering dates/folders, notes/tags, bytes, deduplication, edit preservation, empty-file error and reload. OS-picker cancellation remains unverified; browser cancel-event handling is separately covered |
| Conversion and compression | Host | Existing job owner retained; image conversion and downloadable ZIP passed over HTTP; full format/UI matrix pending |
| Clipboard and share | Visiting device | File-action acceptance covers clipboard denial/empty feedback and byte-exact download alternatives; real visiting-device clipboard permissions and physical-device sharing remain pending |
| Queue/Downloads controls and progress | Host | Pause/resume HTTP check; existing durable queue and governor; live Twitter budget deferral observed and countdown exposed; full ingest settlement/recovery/load matrix pending |
| Twitter quote/image/video | Host | Deterministic fixtures plus live original image/video playback, seeking and reload in Chrome; live parent/quote/author/file identities checked; native cards verified for image/video samples and existing screenshot fallback verified for the quote; direct downloads above the upstream 50 MiB ceiling and full import settlement remain open |
| Accounts, Watches and collectors | Electron host + paired browser extension | Owner paired Chrome and connected Twitter through New Source; existing importer transferred the requested session and host collector queued 4,102 live Saves; other Sources, schedules and Watches acceptance pending |
| Browser extension connection | Browser extension + host | Separate Circé Chromium build; scoped auth/origins, restart persistence, expiry/rotation/revocation tested; real Chrome pairing and manual capture reused the existing Save ID, with metadata Undo verified; automatic hooks and remote-device extension matrix pending |
| Assistant streaming, chat persistence and citations | Electron host + browser | Authorized ChatGPT subscription via Codex; live HTTP search/persisted citation passed; actual shared Chrome composer, streamed completion and citation to the correct image passed |
| Assistant model preferences | Host | Browser stale-preference defect fixed with regression test; Codex Default selection survives reload |
| Assistant attachments and chat export | Browser + host | Uploaded attachment registration retains names and hides host paths; Markdown download adapter implemented; provider vision and full browser flow pending |
| Assistant review, stop and recovery | Host + browser | Live Chrome Stop, persisted review after host restart, Apply and exact-value Undo passed; empty reviews and nullable-note conflict defects fixed; broader question/provider/device matrix pending |
| Authentication, origins and session lifecycle | Host | Exact Host/Origin checks, Library binding, Secure HTTPS cookie, login limits and immediate stream revocation passed. Digest-only 0600 session persistence survived real host replacement; explicit logout removed the stored session and returned 401 |
| Deep links and reload | Browser + host | Folder/tag scope encoded in browser history; Chrome folder and Save reload, app Back/Forward and browser Back passed; finite desktop/mobile smoke includes folder reload; Saved View/filter-history matrix pending |
| Private Tailscale HTTPS | Host | Serve on port 9443; same-machine authenticated HTTPS/restart check passed; owner confirmed access from remote Windows after private key-file delivery; existing Serve routes preserved |
| Mobile browser composition | Browser | Real 320/390/768 coarse-pointer Save, preview, file-action and Settings/200% layouts passed. The production PWA passed fifteen real checks, including five layouts, safe areas, mutually exclusive phone drawers, 44-pixel critical controls and actual offline/reconnect/login/logout; physical iPad Safari remains unverified after the simulator runner failed its prescribed retry |
| Archive replay | Isolated browser origin + native archive owner | Twenty-two actual HTTPS checks passed, including decoded page/CSS/JS/media/frame/worker playback, internal navigation and shared HUD, hostile content and forged-message rejection, read-only worker configuration, worker restart, trusted external-link confirmation, exact Tailnet socket delivery, and grant/session/Library revocation. Native archive checksums were unchanged |
| Combine Images | Browser + host compositor | Shared dialog and original options; HTTP create/export/path denial, Chrome create and 390-pixel download workflow passed; broader format/drop/device matrix pending |
| Detached preview windows | Visiting browser + host media | Eight actual UI checks pass: detached image transforms, Save navigation, slideshow, original download, popup-denied fallback, and touch-sized playable video controls at 320/390 pixels; physical-device acceptance pending |
| Library administration and maintenance | Native owners + scoped browser chooser | Twelve administration checks cover create/open/move/backup/independent restore/merge/cancel; fifteen maintenance checks cover watched folders, Rescan and four repairs with real Undo and stale-preview rejection. Original Library and preferences restored after each fixture run |
| Fonts and OS integrations | Explicit host helper + visiting-device alternatives | Settings identify host actions explicitly. Native Local API status/port and MCP launch context use this Circé profile; real MCP initialize/list/read passed in a disposable context. Font activation uses the real host user Fonts directory, while Download supplies the original to the visiting device; four real font UI groups passed activation, reload, visiting download and deactivation, with fresh-process CoreText checks and exact owned-file cleanup |
| Library logo and browser tab icon | Browser + host | Visiting-device file picker uses the native PNG normalizer and portable Library metadata; real UI upload/reset, icon and emoji selection, invalid-image/retry, Cancel, Settings name change and combined name/mark rename passed, including bundle restart and reauthentication; tab icon follows the active Library logo |
| Library create, backup, restore and move | Native owners + browser host-folder chooser | Complete real UI create/upload, checksum-verified backup, independent restored-copy identity/contents, Move identity/media/source removal, recent/open, active no-op, repeated-merge deduplication and cancellation matrix passed; restored snapshots cannot reuse the source index |
| File pickers, thumbnails and specialized exports | Visiting device + native persistence | Seventeen real HTTPS checkpoints passed: custom thumbnail/cancel/corruption, visiting clipboard denial/empty feedback, replacement bytes/name, both nonzero GIF-frame actions, playable SRT captions, valid/invalid dotLottie, decoded WebP and redacted debug ZIP. Coarse-pointer 320/390/768/1280, desktop 200% zoom and 390 RTL fit/hit/touch checks passed; actual OS clipboard and physical-device checks remain pending |
| Enrichment and semantic/visual search | Browser + host persistence | Resident native owner reuses the existing registry/models; real sensitive-content image processing, closed-client completion, durable retry, crash recovery and sidecar agreement passed. Browser inference uses scoped binary uploads; other model/format and physical-device acceptance pending |
| Copy to Library and storage limits | Native owners + browser host-folder chooser | Eight real UI groups passed picker cancellation, exact copied bytes/notes/tags, fresh identities, repeat/self-copy handling, destination open, storage enable/disable/limits, immediate pause and reload; original preferences were restored |
| Transfer recovery and desktop handoff | Native durable job owner + transport-specific delivery | Four real UI groups passed deterministic failure, physical Retry and Cancel, completed receipt, byte-identical automatic/explicit/reload download of a 256 MiB ZIP. Desktop Retry uses the same delivery hooks, and native Save As can retrieve completed browser artifacts |
| PWA installation and reconnect | Visiting browser + online native host | Fifteen real production checks passed: decoded manifest icons, five touch/RTL/200% layouts, safe areas, phone drawer switching, actual network failure with reconnect guidance, online same-session recovery, confirmed logout and real key-file login. The reconnect page now uses shared Empty/Button components with a self-contained icon; its static dependency allowlist is cached. A finite server-shutdown check verifies four widths and keyboard reconnect. Private Library data is never cached for offline editing |
| Electron removal / Linux service | Deferred runtime project | Requires concrete collector, process and lifecycle replacements |

The exhaustive `web-capabilities.ts` and browser bridge classification make new
operations require review. They distinguish native/path operations from allowed
transport operations, but do not turn pending workflows into completed parity.

The live assistant used only disposable fixture content. No API key, normal Pond
Library or production Source cookies were used. The private development Library
continues to be owned by one Electron host. See [verification](verification.md)
for exact evidence and [the execution plan](../../plans/001-complete-browser-parity.md)
for the remaining phases.

## Pond 2.0 integration

`main` mirrors upstream. `web` includes that history through `029bfcb1`, including
the 19 commits bringing Pond 2.0.1 after the previous sync. This is an explicit sync;
no scheduled upstream updater is configured. See the [sync process](sync.md).

- All 18 Source descriptors, harvesters and settings come from the shared Pond 2
  implementation. Bluesky handle connection has an HTTP command adapter.
- Fish CRUD, routines, MCP server settings and presence events use the existing
  host handlers. Extension captures target Fish in browsers without focusing a
  native host window. Apple Intelligence still runs on a supported Mac host.
- Import Data Export chooses a ZIP on the visiting device, uploads it with an
  opaque Library-bound ticket, and calls Pond's archive reader on the host.
- Bluesky private bookmarks retain upstream's host sign-in window. The browser
  explicitly labels that step; public likes use the handle form.
- Refresh from Source, product detection, source-icon repair, dark-mode media
  counts and batched tag vocabulary embeddings share the upstream implementation.
  Refresh sign-in notices travel over the authenticated browser event stream.
- Safari extension status and settings remain native desktop operations. The
  visiting browser does not show controls for the host's Safari installation.
- Fish prompts and 3D marks, the revised sensitive-content model, keyboard
  fixes, Pinterest harvesting, and import/tagging repairs use the shared 2.0.1
  implementation. Browser pacing follows local visibility/focus; browser thermal
  telemetry and native MCP-client detection remain unavailable. Browser app
  information derives its version from the desktop package.
- Circé's Portless launcher supports `https://circe.elkyiem` locally and through
  shared tailnet DNS and HTTPS. Visiting devices trust the Mac's CA once; no
  client proxy is required. Exact-origin validation, session cookies, uploads
  and media ranges have offline regression coverage.

The offline suite and production bundles are checked separately from live Source
sign-ins and physical-device acceptance. Earlier verification entries describe
their recorded baseline; they do not prove every new Source or Fish provider.
