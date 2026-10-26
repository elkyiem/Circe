# Feature parity ledger

Baseline: Pond 1.6.3 at `0e9dc817e17baafe60d9151a7fc49be5dc3e0861`.
Long-term objective: every Pond workflow from desktop and mobile browsers.
Full parity is **in progress**. An exposed operation is not verification evidence.

| Capability | Execution owner | Demonstrated coverage / remaining work |
| --- | --- | --- |
| Pond renderer, components, design system | Browser | Shared production entrypoint; no copied application or replacement UI kit |
| Library, pagination, keyword search | Host + browser | Real Library and existing virtualized components; finite browser search passed |
| Title/notes/rating and bulk edits | Host | Bounded transaction schema; HTTP edit, stale edit rejection, grouped history and stale Undo rejection passed; broader UI matrix pending |
| Folders, tags, groups, rules, Saved Views | Host | Existing domain operations exposed; HTTP folder/tag/view CRUD passed; shared Chrome folder assignment/removal/reload passed |
| Canvas CRUD, autosave and export | Host + browser | HTTP CRUD, rename retention and stale content rejection passed; dedicated host render job exports PNG/PDF with actual Board tiles; shared Chrome PNG download passed; broader board-tool and cross-client matrix pending |
| Image/video viewing and seeking | Host media + browser | Actual shared viewers and original media; authenticated HEAD, 206/416 and byte ranges verified |
| Video frames and compatible previews | Host FFmpeg | HTTP decoded frame, sampled frames, cross-Save thumbnail rejection and Save-bound preview ranges passed; clipboard/frame UI matrix pending |
| Visiting-device upload/import | Browser + host | Bounded uploads and Library-bound tickets; nested folder and same-name originals retained, request retry reuses Saves/folders, traversal denied; real Chrome picker and duplicate-review import passed; interruption matrix pending |
| Pond packages, original files and CSV | Host + browser download | Real export/importers retained; ZIP envelope, Capture identity, selected file retention, same-Library dedup and artifact auth/ranges passed; fresh-Library round trip pending |
| Eagle/bookmarks/Mymind import | Host | Browser upload adapters implemented; format-specific browser fixtures still pending |
| Conversion and compression | Host | Existing job owner retained; image conversion and downloadable ZIP passed over HTTP; full format/UI matrix pending |
| Clipboard and share | Visiting device | Browser implementations with download alternatives; permissions and cross-browser matrix pending |
| Queue/Downloads controls and progress | Host | Pause/resume HTTP check; existing durable queue and governor; selected status events forwarded; recovery/load matrix pending |
| Twitter quote/image/video fixtures | Host | Existing queue renders Pond light/dark cards and original media; parent/quote/author/file identities verified; fixtures do not prove live X sync |
| Accounts, Watches and collectors | Electron host | Original collectors retained; host sign-in helper implemented, using the existing session importer; no live Account connected or live sync verified |
| Assistant streaming, chat persistence and citations | Electron host + browser | Authorized ChatGPT subscription via Codex; live HTTP search/persisted citation passed; actual shared Chrome composer, streamed completion and citation to the correct image passed |
| Assistant model preferences | Host | Browser stale-preference defect fixed with regression test; Codex Default selection survives reload |
| Assistant attachments and chat export | Browser + host | Uploaded attachment registration retains names and hides host paths; Markdown download adapter implemented; provider vision and full browser flow pending |
| Assistant review, stop and recovery | Host + browser | Live Chrome Stop, persisted review after host restart, Apply and exact-value Undo passed; empty reviews and nullable-note conflict defects fixed; broader question/provider/device matrix pending |
| Authentication, origins and session lifecycle | Host | Exact Host/Origin checks, Library binding, Secure HTTPS cookie, login limits, immediate stream revocation and logout tests passed |
| Deep links and reload | Browser + host | Real browser history and application fallback; Save/assistant/settings paths and saved-item reload passed; folder contents persist but the active folder resets on reload, pending navigation adaptation |
| Private Tailscale HTTPS | Host | Serve on port 9443; same-machine authenticated HTTPS/restart check passed; existing Serve routes preserved; second-device test pending |
| Mobile browser composition | Browser | Earlier Chromium 390×844 milestone passed; expanded workflow matrix and physical phone remain pending |
| Archive replay | Needs isolated browser equivalent | Electron webview retained for desktop; browser replay is not enabled until separate-origin authentication and hostile-content isolation are proven |
| Combine Images | Browser + host compositor | Shared dialog and original options; HTTP create/export/path denial, Chrome create and 390-pixel download workflow passed; broader format/drop/device matrix pending |
| Detached preview windows | Needs browser equivalent | Existing main Save viewer is available; detached-window composition pending |
| Fonts, OS integrations and Library administration | Needs explicit host helper/equivalent | Generic path/dialog operations remain blocked; lifecycle, backups, extension pairing and settings coverage remain pending |
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
