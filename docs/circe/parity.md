# Feature parity ledger

Baseline: Pond 2.0.0 plus upstream `main` through `c594ed4d` (2026-10-27).
Long-term objective: every Pond workflow from desktop and mobile browsers.
Full parity is **in progress**. An exposed operation is not verification evidence.

| Capability | Execution owner | Demonstrated coverage / remaining work |
| --- | --- | --- |
| Pond renderer, components, design system | Browser | Shared production entrypoint; no copied application or replacement UI kit |
| Library, pagination, keyword search | Host + browser | Real Library and existing virtualized components; finite browser search passed |
| Title/notes/rating and bulk edits | Host | Bounded transaction schema; HTTP edit, stale edit rejection, grouped history and stale Undo rejection passed; broader UI matrix pending |
| New Note and text editor | Browser + host | Real New Note menu, title/body editing, reload and host restart passed at 1280- and 390-pixel widths; manual-input transport retains the explicit text type; richer editing and concurrent document checks pending |
| Folders, tags, groups, rules, Saved Views | Host | Existing domain operations exposed; HTTP folder/tag/view CRUD passed; shared Chrome folder assignment/removal/reload passed |
| Canvas CRUD, autosave and export | Host + browser | HTTP CRUD, rename retention and stale content rejection passed; dedicated host render job exports PNG/PDF with actual Board tiles; shared Chrome PNG download passed; broader board-tool and cross-client matrix pending |
| Image/video viewing and seeking | Host media + browser | Actual shared viewers and original media; authenticated HEAD, 206/416 and byte ranges verified |
| PDF, audio, fonts, text, EPUB, 3D, ZIP, Live Photo, HTML and native previews | Browser + host processing | Twelve representative viewer fixtures passed at 1280- and 390-pixel widths; PDF search/rotation, audio playback, Live Photo seeking, HTML isolation and original download checked; broader format/control/device matrix pending |
| Video frames and compatible previews | Host FFmpeg | HTTP decoded frame, sampled frames, cross-Save thumbnail rejection and Save-bound preview ranges passed; clipboard/frame UI matrix pending |
| Visiting-device upload/import | Browser + host | Bounded uploads and Library-bound tickets; nested folder and same-name originals retained, request retry reuses Saves/folders, traversal denied; real Chrome picker and duplicate-review import passed; interruption matrix pending |
| Pond packages, original files and CSV | Host + browser download | ZIP envelope, Capture identity, original bytes, same/fresh-Library dedup, folder paths, organization names, re-export and second-process restart passed; artifact auth/ranges and CSV verified |
| Eagle/bookmarks/Mymind import | Host | Browser upload adapters implemented; format-specific browser fixtures still pending |
| Conversion and compression | Host | Existing job owner retained; image conversion and downloadable ZIP passed over HTTP; full format/UI matrix pending |
| Clipboard and share | Visiting device | Browser implementations with download alternatives; permissions and cross-browser matrix pending |
| Queue/Downloads controls and progress | Host | Pause/resume HTTP check; existing durable queue and governor; live Twitter budget deferral observed and countdown exposed; full ingest settlement/recovery/load matrix pending |
| Twitter quote/image/video | Host | Deterministic fixtures plus live original image/video playback, seeking and reload in Chrome; live parent/quote/author/file identities checked; native cards verified for image/video samples and existing screenshot fallback verified for the quote; direct downloads above the upstream 50 MiB ceiling and full import settlement remain open |
| Accounts, Watches and collectors | Electron host + paired browser extension | Owner paired Chrome and connected Twitter through New Source; existing importer transferred the requested session and host collector queued 4,102 live Saves; other Sources, schedules and Watches acceptance pending |
| Browser extension connection | Browser extension + host | Separate Circé Chromium build; scoped auth/origins, restart persistence, expiry/rotation/revocation tested; real Chrome pairing and manual capture reused the existing Save ID, with metadata Undo verified; automatic hooks and remote-device extension matrix pending |
| Assistant streaming, chat persistence and citations | Electron host + browser | Authorized ChatGPT subscription via Codex; live HTTP search/persisted citation passed; actual shared Chrome composer, streamed completion and citation to the correct image passed |
| Assistant model preferences | Host | Browser stale-preference defect fixed with regression test; Codex Default selection survives reload |
| Assistant attachments and chat export | Browser + host | Uploaded attachment registration retains names and hides host paths; Markdown download adapter implemented; provider vision and full browser flow pending |
| Assistant review, stop and recovery | Host + browser | Live Chrome Stop, persisted review after host restart, Apply and exact-value Undo passed; empty reviews and nullable-note conflict defects fixed; broader question/provider/device matrix pending |
| Authentication, origins and session lifecycle | Host | Exact Host/Origin checks, Library binding, Secure HTTPS cookie, login limits, immediate stream revocation and logout tests passed |
| Deep links and reload | Browser + host | Folder/tag scope encoded in browser history; Chrome folder and Save reload, app Back/Forward and browser Back passed; finite desktop/mobile smoke includes folder reload; Saved View/filter-history matrix pending |
| Private Tailscale HTTPS | Host | Serve on port 9443; same-machine authenticated HTTPS/restart check passed; owner confirmed access from remote Windows after private key-file delivery; existing Serve routes preserved |
| Mobile browser composition | Browser | Earlier Chromium 390×844 milestone passed; expanded workflow matrix and physical phone remain pending |
| Archive replay | Needs isolated browser equivalent | Electron webview retained for desktop; browser replay is not enabled until separate-origin authentication and hostile-content isolation are proven |
| Combine Images | Browser + host compositor | Shared dialog and original options; HTTP create/export/path denial, Chrome create and 390-pixel download workflow passed; broader format/drop/device matrix pending |
| Detached preview windows | Needs browser equivalent | Existing main Save viewer is available; detached-window composition pending |
| Fonts, OS integrations and Library administration | Needs explicit host helper/equivalent | Generic path/dialog operations remain blocked; lifecycle, backups and settings coverage remain pending; extension pairing is tracked separately |
| Library logo and browser tab icon | Browser + host | Visiting-device file picker uses the native PNG normalizer and portable Library metadata; upload, cancel, invalid/oversized files, origin/Library fences, reset and reload verified; tab icon follows the active Library logo |
| Enrichment and semantic/visual search | Browser + host persistence | Existing inference code retained; default browser enrichment off; single execution owner and closed-tab processing are not yet implemented or claimed |
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

`main` was 107 commits behind upstream and has been fast-forwarded. `web` merges
that history while retaining its browser features. This is an explicit sync;
no scheduled upstream updater is configured.

- All 18 Source descriptors, harvesters and settings come from the shared Pond 2
  implementation. Bluesky handle connection has an HTTP command adapter.
- Fish CRUD, routines, MCP server settings and presence events use the existing
  host handlers. Extension captures target Fish in browsers without focusing a
  native host window. Apple Intelligence still runs on a supported Mac host.
- Import Data Export chooses a ZIP on the visiting device, uploads it with an
  opaque Library-bound ticket, and calls Pond's archive reader on the host.
- Bluesky private bookmarks retain upstream's host sign-in window. The browser
  explicitly labels that step; public likes use the handle form.
- Circé's Portless launchers support `https://circe.elkyiem` locally and through a
  local forwarding proxy on another Tailscale device. Exact-origin validation,
  session cookies, uploads and media ranges have offline regression coverage.

The offline suite and production bundles are checked separately from live Source
sign-ins and physical-device acceptance. Earlier verification entries describe
their recorded baseline; they do not prove every new Source or Fish provider.
