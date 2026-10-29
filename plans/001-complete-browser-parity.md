# Plan 001: Complete Pond feature parity in the Circé browser client

> Execution was authorized in this chat on 2026-10-26, including use of the
> ChatGPT subscription. Deliver independently verified commits and keep the
> desktop application operational. Full parity remains in progress; the ledger
> records demonstrated coverage and pending requirements.

## Status and objective

- Priority: P1; effort: XL overall; integration risk: high.
- Planned at: `2629bfb53b8a6840a3b69f45c113b98a32d79f4d`, 2026-10-26.
- Audited upstream: Pond 1.6.3,
  `0e9dc817e17baafe60d9151a7fc49be5dc3e0861`.
- Category: direction / platform adaptation. Dependencies: existing host-backed
  browser milestone.
- Target: every Pond product workflow usable from desktop and mobile browsers,
  using the resident Electron host where a browser cannot perform the operation.
- Electron removal is a later, independent runtime project. It is not required
  for browser parity and must not block it.

Before execution, run `git status --short` and
`git diff --stat 2629bfb53b8a6840a3b69f45c113b98a32d79f4d..HEAD -- apps/desktop apps/extension packages/schema docs/circe .github/workflows`.
Preserve newer work. Reconcile changed assumptions against this roadmap before
implementing the affected phase.

## Product rules

Pond's renderer, Base UI components, CSS Modules, theme, interactions and file
formats remain the reference. The Library on disk is authoritative; SQLite is
its index. Main owns persistence and privileged operations; the renderer owns
presentation and optimistic state. These are existing repository decisions in
`docs/contributing/architecture.md`.

Use the vocabulary in `CONTEXT.md`: Library, Save, Capture, Seed, Account, Watch,
Smart Folder, Saved View and Canvas. A Canvas references Saves by stable ID;
a Capture retains Source identity, author, media and quoted content.

Browser parity means equivalent outcomes. A native OS surface needs a deliberate
substitute: Download for exporting to this device, Upload for importing from this
device, and an explicitly labelled host operation for host filesystem work.
An unavailable-action toast alone is not completed parity. Browser restrictions
must remain explicit in the ledger; they must not be silently counted as done.

## Current state and evidence

The first milestone already shares the actual renderer, uses typed HTTP queries,
cookie-authenticated media and SyncAction SSE, and exercises a disposable Library.
Browsing, folder assignment, image/video fixtures and restart persistence work.
Subsequent slices verified shared Chrome sign-in, organization, representative
viewers, assistant streaming/review and a paired Circé extension. On 2026-10-26
the owner connected Twitter through that extension; the resident host queued
4,102 live Saves. Live original image/video playback and seeking, quote identity
and a manual duplicate capture passed. Full ingest settlement, automatic hooks,
other Sources and the remaining parity matrix are still open. The dated evidence
and current boundaries live in `docs/circe/{verification,parity}.md`.

Key owners to inspect before changing a phase:

| Owner | Files and current significance |
| --- | --- |
| Desktop surface | `apps/desktop/src/preload/index.ts`: `PondApi`, commands, events, MessagePort Agent stream |
| Typed operations | `apps/desktop/src/shared/query-contracts.ts` and imported `*-contracts.ts`; query composition in `main/ipc/queries/index.ts` |
| Browser transport | `apps/desktop/src/shared/web-contracts.ts`, `main/web/{app,queries,index,auth,media}.ts` |
| Browser adaptation | `apps/desktop/src/renderer/src/browser/adapter.ts`, `browser/index.tsx`, `browser/styles.module.css`, `apps/desktop/vite.browser.config.ts` |
| Mutations/history | `main/ipc/handlers/app.ts`, `main/core/executor.ts`, `packages/schema/src/tx.ts` |
| Upload/import | `shared/saves-import-contracts.ts`, `main/ipc/queries/saves-import*.ts`, `main/core/transfer-jobs.ts` |
| Exports/conversions | `main/ipc/queries/{saves-export,conversion,transfer-jobs}.ts`, `main/core/{export-saves,pond-package}.ts` |
| Collection/auth | `main/ipc/handlers/refresh.ts`, `main/core/{session-import,sync/accounts}.ts`, `main/core/refresh/harvest-window/` |
| Agent | `main/ipc/handlers/agent-stream.ts`, `main/core/agent/`, `renderer/src/features/agent/state/chat-transport.ts` |
| Media/viewers | `main/protocol.ts`, `renderer/src/features/saves/lib/media/`, `features/saves/components/viewers/` |
| Canvas | `shared/canvas-contracts.ts`, `main/ipc/queries/canvases.ts`, `renderer/src/features/canvas/` |
| Settings | `main/ipc/queries/{settings,library,library-backups,library-repairs,api-tokens}.ts`, `renderer/src/features/settings/lib/{sections,registry}.tsx` |
| Enrichment | `renderer/src/features/enrichment/`, `main/core/enrichment-sidecar.ts`, `main/ipc/queries/media-understanding.ts` |
| Extension | `apps/extension/utils/native.ts`, extension background capture, `packages/schema` native/session contracts |

Paths under `main/`, `shared/` and `renderer/` in the table are relative to
`apps/desktop/src/`. Confirm existence with `rg --files` before introducing a new
owner; do not create guessed duplicate modules.

Concrete examples from this revision:

```ts
// renderer/src/browser/adapter.ts:147 onward
openCombineImagesWindow: unsupported,
tx: unsupported,
batch: unsupported,
undo: unsupported,
redo: unsupported,
// Later in the same object: connectSource, syncRunNow, pipelinePause,
// archiveSite and agentStream are also unsupported.
```

```ts
// main/web/queries.ts:31
"settings.getPrefs": () => ({ ...DEFAULT_PREFS, setup: { version: 1 } }),
"updates.currentNotice": () => null,
```

```ts
// main/ipc/handlers/app.ts:63
const actions = await executeBatch(txs);
recordBatchForUndo(txs);
```

```ts
// shared/canvas-contracts.ts
"canvases.capture": { x: number; y: number; width: number; height: number };
// main/ipc/queries/saves-export.ts
const picked = await dialog.showSaveDialog({ /* native destination */ });
```

The last two examples explain why blindly exposing the desktop registry cannot
complete the port. Operations with native dialogs, Electron sender dependencies,
clipboard effects or window screenshots need adapter-specific entrypoints.

Match `main/web/app.test.ts` for dependency-injected HTTP boundary tests and
`main/ipc/queries/params.ts` for validated handler inputs. Follow code standards:
reuse owner schemas, parse external inputs, retain meaningful errors, no module
mocking, and keep cross-feature imports through public feature entries.

## Architecture to retain and extend

1. Continue the separate browser build sharing feature code. Keep platform code
   in adapters; do not copy features into another frontend.
2. Extend the explicit browser operation allowlist per verified workflow.
   Reuse domain operations behind IPC, never invoke IPC handlers with fabricated
   Electron sender objects. Extract a domain function only where needed.
3. Keep HTTP for commands, SSE for selected host events, and the existing
   Downloads polling for measured transfer telemetry. Add an HTTP streaming
   response for Agent replies. A general transport framework or WebSocket layer
   has no demonstrated need at this point.
4. Preserve one host as the mutation/queue settlement owner. Add active Library
   identity checks to browser writes. Handle stale edits and duplicate request
   delivery explicitly where a workflow requires them.
5. Treat visiting-device actions, browser-session state and host actions as
   distinct. Never translate a phone filename into a server path.
6. Keep provider keys and Source cookies in their existing host owners. Credential
   setup may accept private input over the authenticated connection; no read-key
   operation, secret in URL, shared event payload, log or browser storage.

## Execution sequence

M = a bounded feature group; L = several interacting workflows or a required
prototype. These are relative sizes, not delivery-date commitments. Re-estimate
after each gate using actual work and Source test access.

### Phase 0 — Make parity measurable and establish the verification gate (M)

1. Inventory every `QueryName`, public `PondApi` method/event, registered viewer,
   settings section, native menu action and extension request. Map each to a
   product workflow, execution owner, browser adapter and named acceptance test.
2. Add an exhaustive classification checked against the owner types. Classify
   unsupported methods as planned, restricted or host-helper required; never
   enable an operation merely to satisfy the inventory. Verify that all events
   needed for visible progress have a producer and a browser subscriber.
3. Add browser capability discovery so controls render the correct action or
   labelled substitute. Replace generic dead controls progressively. Preserve
   desktop behavior and component design.
4. Reproduce the recorded theme timeout and native socket cleanup race in an
   isolated environment; establish a passing gate or a narrowly documented,
   evidenced baseline exception. Do not weaken tests globally.
5. Add Circé verification for `web`/`dev`: the inherited CI currently targets
   `main`. Keep main as the clean upstream mirror. Add browser-build and browser
   workflow coverage without removing desktop CI coverage.

Verify: `pnpm typecheck`, `pnpm architecture:check`, `pnpm check`, `pnpm build`,
and `pnpm --filter @pond/desktop build:web`. All added checks must pass; any
baseline exception is separately named with a reproduction. The inventory test
must fail when an unclassified operation or viewer is introduced.

### Phase 1 — Complete Library editing and organization (L; depends on 0)

1. Expose validated title, note, rating, tag, group, folder hierarchy/ordering,
   Folder Cover and folder-rule operations. Support Smart Folder/Group/Saved View
   create, edit, rename, move, delete, layout and sorting through their owners.
2. Port multi-selection and bulk edits using full-query IDs resolved by the
   host, including unloaded pages. Add trash, restore, duplicate review/merge,
   batch rename, and the existing destructive-action confirmation workflows.
3. Adapt `tx`/`batch` callers deliberately: use named domain operations where
   available; otherwise accept only a validated subset of UI transaction shapes.
   Do not publish arbitrary transactions or internal derived-data writes.
4. Reuse the journal, executor and history. Preserve title locks and grouped
   undo. Display that history is host-global; submit Undo/Redo against the exact
   history head the client saw and reject stale requests. Do not let another
   tab silently cause Undo to target a different operation.
5. Add stale-write protection to replacement-style updates that need it, and
   refresh other clients after commits. Include desktop + web concurrent edits.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/main/ipc/queries src/renderer/src/features/library src/renderer/src/features/tags`.
Acceptance: create/edit/organize/trash/restore/undo in a browser, reload and
restart; two clients see the same committed state; stale edits and Undo are
rejected visibly; crash recovery retains the same portable metadata.

### Phase 2 — Real capture, visiting-device import and download/export (L; depends on 1)

1. Connect Quick Add URL/note, blank documents, pasted URLs/text/images and
   dropped files to existing Enqueue/import owners. Reuse dedup and duplicate
   review semantics; include folder assignment at import.
2. Add authenticated, bounded streamed uploads into host-owned staging.
   Validate filenames/size and package extraction paths; never trust a client
   path. Feed staged files into existing import/transfer operations. Define
   cancellation, retry and abandoned-stage cleanup before large imports.
3. Replace save dialogs with authenticated downloadable artifacts for original
   files, multiple files, CSV, Pond packages, Eagle packages and conversion outputs.
   Keep host-native exports available through their existing adapter.
4. Support upload/import of the existing Pond/Eagle/bookmarks/Mymind formats
   already supported upstream. Use purpose-built fixtures for each. A Library
   directory on the host remains a separately labelled host operation.
5. Adapt Clipboard, Copy Image/Thumbnail/Base64 and Share for the visiting
   device. Use Download as the explicit fallback where permission or browser
   support prevents the requested action. Cancellation is not success.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/main/ipc/queries/saves-import src/main/core/pond-package` and the browser smoke.
Acceptance: upload from a phone, close its tab during host processing, reopen
and find the Save complete; repeated request delivery does not duplicate import;
package round trips preserve IDs, relationships and original bytes; partial
upload/extraction failures leave recoverable staging rather than incomplete Saves.

### Phase 3 — Complete Sources, Accounts, Watches and Downloads (L; depends on 2)

1. Expose Account labels/import scope, Watches, Source schedules/download
   policies, run/full sync/cancel, Capture refresh/backfill and their statuses.
2. Adapt pause/resume/retry/cancel and history for Downloads, source gates and
   generations using existing queue/governor controls. Keep rate limits and
   collector implementations unchanged.
3. Publish selected typed session/sync/storage events alongside SyncActions;
   retain bounded Downloads polling. Reconnect must repair missed state. Verify
   logout/session expiry stops access to subsequent events and media.
4. Add an explicit host connection flow: browser starts/observes the request;
   sign-in completes on the host through Pond's existing browser/extension and
   session-import path. Report when host interaction is required. The Circé page
   cannot read another site's browser cookies. Do not promise phone-only Account
   setup without a separate, demonstrated Source-specific implementation. Mark
   host-assisted sign-in honestly; it does not complete a requirement for fully
   remote Account setup. Prototype that requirement source by source before
   deciding whether an additional helper is acceptable.
5. Keep host extension capture working. Make any later remote extension pairing
   a separately scoped, revocable workflow; never broaden the browser mutation
   cookie into a general extension credential.
6. Maintain a per-Source coverage matrix from `SOURCE_DESCRIPTORS`: supported
   URL types, media, Account/Watch sync, expiry, rate limits, errors and recovery.
   Offline fixtures precede opt-in live checks with an explicitly connected test
   Account. Verify each Source; one successful X session proves only X coverage.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/main/core/sync src/main/core/refresh src/main/core/pipeline src/main/ipc/queries/accounts`.
Acceptance: start from web, observe host sign-in, sync real test Saves, stop and
restart the host, and resume without duplicated Saves or leaked credentials.
Record live evidence independently of fixture results. Preserve quoted Capture,
card PNGs and separately downloaded original media identity for Twitter/Threads.

### Phase 4 — Complete viewers, editing, conversion and Canvas (L; depends on 2)

1. Enumerate actual viewer capabilities from `viewer-capability.ts` and its
   registries. Exercise all supported upstream file kinds: direct/native images,
   audio/video, PDFs, text/Markdown/documents, fonts, EPUB, models, animations,
   generated previews and archives as applicable. Include missing/corrupt files.
2. Adapt authenticated derived assets, compatible-video previews, subtitles,
   waveform/frame data, posters, custom thumbnails, image combinations and
   conversion/compression jobs. Keep processing on the host where it already
   lives. Binary outputs need byte/stream routes; JSON Date serialization does
   not make `Uint8Array` transport correct.
3. Persist editable document changes using the same Save representation and
   conflict handling as Phase 1. Preserve media-selection policy and original
   files. Add download/copy-frame equivalents for native output operations.
4. Prototype archive replay isolation early in this phase. The current viewer
   uses Electron `<webview>`. Archived scripts/HTML must not run with access to
   Circé's authenticated application origin. Prove authenticated asset delivery,
   internal navigation and sandbox/origin isolation in a real browser before
   choosing the final replay adapter. Keep WARC/replay formats unchanged.
5. Port Canvas CRUD/autosave, cards, notes, drawings, connectors, groups, crops,
   layers, clipboard and file drops. Add conflict handling for full-content
   autosaves and rename races. `canvases.capture` currently needs an Electron
   window: prototype faithful browser export or a host render job that receives
   validated Canvas state. Never capture the unrelated visible host window.
6. Adapt preview/combine-image windows into shared-component overlays or browser
   windows with reliable fallback when popups are unavailable.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/renderer/src/features/saves src/renderer/src/features/canvas src/main/core/combine-images src/main/ipc/queries/canvases src/main/ipc/queries/conversion`.
Acceptance: one representative fixture per registered capability; visual
comparison against desktop; media seek/copy/export; document reload; Canvas
rename/edit/reload/export; archived hostile content cannot invoke Circé operations
or read credentials. Preserve PNG/media Twitter viewing as the baseline.

### Phase 5 — Complete Agent, providers, semantic search and enrichments (L; depends on 1, 2 and 4)

1. Adapt the existing `streamAgentTurn` HTTP-compatible response to an
   authenticated POST stream. Preserve the AI SDK message format, metadata,
   citations, questions, review cards and selected run controls. Reuse chat state
   and persistence rather than rebuilding chat UI.
2. Bind stop/cancel to the exact chat/request and authenticated caller; define
   disconnect behavior. Reopening a chat must read persisted messages without
   starting another model turn. Test completion, error and cancellation.
3. Port provider/model settings, enable/disable/remove, private secret entry,
   local endpoints and host subscription connections. Return connection status
   and masked metadata only. Keep provider clients/keys and local CLI auth on
   the host; a phone's localhost does not identify a model on the host.
4. Preserve Agent review/Apply/Undo, exact-argument and Library identity checks,
   replay prevention, attachments, model preferences and Markdown export.
   Agent tool access and authenticated browser UI access remain separate catalogs.
5. Adapt existing browser inference media/persistence paths and capability
   detection. Reuse embeddings/OCR/captions/transcription/tagging/sensitive-content
   owners and their stored formats. Establish one execution owner for each job
   so several open browsers do not repeat expensive work or race writes.
6. For processing expected to survive closed tabs, use the existing host sidecar
   where it supports that task, or implement the missing host execution path.
   Keep a precise foreground-only state until this has been proven. Preserve
   semantic/visual search behavior and compatibility with existing embeddings.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/main/core/agent src/renderer/src/features/agent src/renderer/src/features/enrichment`.
Acceptance: offline Agent stream fixtures first; approved live provider check
later; stop/reload/review/undo persists correctly; secrets absent from responses,
storage and logs; close the browser during host-owned enrichment and verify its
completion after reopening. Compare retrieval results with the desktop fixtures.

### Phase 6 — Complete settings, Library administration and OS equivalents (L; depends on 1–5)

1. Reuse Settings components in browser routes/overlays. Explicitly separate
   visiting-device appearance/navigation preferences, Library settings, host
   processing/scheduling settings and host operating-system settings.
2. Port Library identity, recent Libraries, create/switch/merge/transfer,
   backup/restore, storage guard/limits, integrity, repair previews, rescans and
   supported resets. Use opaque configured Library/location IDs or a bounded
   host selector; never expose unrestricted path-based operations by default.
3. On Library transitions, preserve admission stop/drain, queue ownership and
   transaction recovery. Invalidate/rebind every browser session and cache to
   the new identity. Reject requests issued against the previous Library.
4. Adapt backup/import download versus host destination distinctly. Reuse
   preview/confirmation semantics for destructive repair/reset/purge; test failure
   recovery on disposable copies. Browser configuration must not replace host
   preferences wholesale with device defaults.
5. Map global shortcuts, tray/menu actions, quick capture, auto-import folders,
   Open With, Reveal, Quick Look, font activation, notifications, startup options
   and updates to browser controls or explicitly labelled host-helper actions.
   A browser cannot install fonts or select another machine's Finder window as
   a normal visiting-device operation. Retain Download/Preview fallbacks.
6. Preserve extension, CLI/Raycast and stdio MCP integrations on their host
   boundary. Browser settings may configure allowed host capabilities; do not
   invent a remotely reachable stdio MCP endpoint or auto-install native helpers.

Verify: `pnpm --filter @pond/desktop exec vitest run src/main/web src/main/ipc/queries/library src/main/ipc/queries/settings src/main/core/transfer-jobs` plus existing isolated desktop trust/folder/Agent smoke checks where affected.
Acceptance: complete each settings-section workflow; backup/restore round trip;
switch during active work with stale writes rejected; source/credential isolation;
explicit distinction between Download to this device and Write on host.

### Phase 7 — Private remote use, mobile completeness and release (L; cross-cutting, final gate)

Start small-screen and remote regression coverage in Phase 0 and expand it with
every phase; do not postpone mobile fixes to this final gate.

1. Verify private Tailscale HTTPS against the same exact-origin policy for
   operations, uploads, downloads, media, streaming and events. Preserve loopback
   binding behind the private proxy; test forwarded Host/origin behavior rather
   than trusting arbitrary forwarded headers. Define owner session revocation
   and private device onboarding. Public deployment remains out of scope.
2. Check real iOS Safari and Android Chrome, alongside desktop Chrome, Safari
   and Firefox. Cover touch/keyboard, selection/drag alternatives, Canvas gestures,
   file picks, clipboard permissions, fullscreen, downloads, focus and reduced
   motion. Do not claim physical-device verification from resized Chromium.
3. Verify reload/deep links/back navigation, host sleep/restart, slow networks,
   interrupted large files, connection gaps, session expiry, multiple clients,
   large Libraries and media processing under load. Do not add a second offline
   writable Library or background service solely to hide disconnection.
4. Complete the exhaustive feature matrix: verified browser workflow, verified
   host-helper workflow, or explicit unresolved restriction. Restricted features
   stay visible in the release notes; unrestricted full parity requires that
   they have an accepted equivalent. Remove milestone-only fixture controls from
   ordinary operation while retaining opt-in offline fixtures for tests.
5. Run full checks, desktop regression and portable-format compatibility tests.
   Promote only completed verified slices from web to dev; keep web current with
   dev. Repeat the acceptance matrix for every adopted upstream baseline.

Verify: all common commands below, plus the live Source/device/remote matrix with
recorded environment, date, expected outcome and result. Release status cannot
be inferred from a list of endpoints or an unchanged-looking UI.

## Verification commands and conventions

Use Node 24 and pnpm 11.27.0. Existing commands:

```sh
pnpm check
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @pond/desktop build:web
pnpm --filter @pond/desktop exec vitest run src/main/web src/shared/web-serialization.test.ts src/main/lib/byte-range.test.ts
pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs
env -u ELECTRON_RUN_AS_NODE pnpm --filter @pond/desktop exec electron scripts/smoke-web-browser.cjs
# After an authorized restart of the same isolated host:
pnpm --filter @pond/desktop exec node scripts/smoke-web.mjs --after-restart
```

Every new transport family needs auth/origin denial, schema/serialization,
meaningful errors, cancellation, session expiry and Library-identity coverage.
Add typed event cleanup/gap tests when event behavior changes. Add binary/range,
file-containment and lifecycle tests when file access changes. New tests should
live with their owners and test observable behavior, following existing patterns.

The current browser smoke is finite Chromium without preload, not complete
cross-browser proof. Extend it for deterministic workflows and also use the
collaborative browser for observable checks. Native host UI actions must be
screenshot-guided and inspected after each action.

Do not rerun huge suites for plan-only changes. During implementation, run the
focused gate after each slice and the full graph before promotion. Record
environment failures, baseline failures and regressions separately.

## Scope, branches and safety boundaries

Implementation scope: the explicit owners listed above, related colocated tests,
browser build/verification configuration, and `docs/circe` plus architecture docs.
Phase 0 should turn each slice into a smaller task with an exact file list before
implementation. Do not use this broad roadmap as a license for unrelated cleanup.

Preserve the upstream license, package names, Source IDs and portable formats.
No renderer rewrite, new UI kit, PostgreSQL, Redis, replacement job system,
Playwright collector replacement, old Circé architecture import or Electron
removal is in scope.

Work in `/Users/elkyiem/Documents/GitHub/Circé` on `web`. Preserve unrelated
changes. Use conventional, independently reviewable commits. Do not push, publish
or open a PR without a request. Baselines flow upstream/main → main → dev → web;
features flow web → dev. Circé commits must never enter main. Record upstream
drift before adopting a newer SHA.

Do not write to `/Users/elkyiem/Documents/GitHub/Circé`,
`/Users/elkyiem/Pond/Elk.pond`, or the normal Pond Application Support profile.
Use existing ignored sandbox data or new purpose-built disposable fixtures;
never copy production cookies. Only the designated shared runtime owner starts
or replaces the development host. Other execution chats use finite checks and
the shared instance; no duplicate servers from worktrees.

## Definition of done

- [ ] Every desktop capability and viewer is classified and linked to evidence;
  additions cannot silently escape the inventory check.
- [ ] All product workflows have a verified browser or accepted host-helper
  equivalent; remaining restrictions are explicit and prevent a full-parity claim.
- [ ] Browser/desktop concurrency, undo, request retries and Library switching
  cannot silently apply work to the wrong state or Library.
- [ ] Portable fixture round trips preserve IDs, Capture/quote relationships,
  folder/view metadata and original bytes.
- [ ] Every supported Source has separate fixture and live-verification status.
- [ ] Agent/enrichment continuity and execution ownership are demonstrated.
- [ ] Untrusted replay content cannot exercise authenticated Circé operations.
- [ ] Desktop checks and web checks pass; any existing exception is evidenced
  and scoped. No test is weakened to disguise a regression.
- [ ] Private HTTPS and physical mobile-device workflows are verified.
- [ ] The parity ledger and runbook match actual shipped behavior.

## Stop conditions and unresolved decisions

Pause only the affected slice and report a concrete blocker when it requires an
unconnected Source Account, provider credential, unavailable physical device or
unapproved deployment. Continue independent fixture work where possible. Do not
ask repeatedly for permission already established in the session.

Reconcile the plan if upstream changed the owner contract or a proposed adapter
would require a data-format migration. Do not improvise credential forwarding,
host shell execution, unrestricted file access, or same-origin archive scripting.
Archive replay, Canvas export and fully remote Source sign-in require explicit
technical proof before promising exact parity. Record any genuine browser limit
and its proposed equivalent for a product decision rather than hiding it.

## Recommended next implementation slice

Updated after live Twitter acceptance on 2026-10-26:

1. Fix oversized direct-video ingestion. The blob path's 50 MiB ceiling currently
   fails the Save before the existing yt-dlp task can run, despite a larger video
   preference. Reuse the existing download/persistence owners, preserve media and
   quote identity, and verify bounded memory, configured limits, cancellation,
   cleanup and retries with deterministic files before retrying live failures.
2. Finish the paced live import and inspect its settled results; verify automatic
   extension bookmark/like capture separately from the proven manual capture.
   Preserve the governor rather than accelerating the Account to satisfy a test.
3. Establish a single host-owned enrichment execution path and verify it with all
   web tabs closed, then continue the remaining organization, format, host-helper
   and device acceptance matrix in the ledger. Exposed capabilities alone remain
   insufficient evidence of parity.


## Current native-backed implementation — 2026-10-29

The audited baseline is now Pond 2.0.1 through `029bfcb1`; implementation continues
on `web` from `57ee6186`. The chosen architecture retains the native host and shared
renderer. The owner clarified that only one device will be active at a time.
Stale-write guards remain for handoff, with no collaborative editing requirement.

Completed acceptance now includes real Library administration and maintenance,
identity/icon/name, file actions, detached previews, isolated archive replay,
Eagle imports, copy/storage, trusted drag/Undo, Settings/interface zoom and Canvas
coordinates, durable transfer failure/cancel/retry/download, resident enrichment,
MCP launch context and persisted browser login across host replacement. The
production PWA passed fifteen actual checks, host fonts passed four, and bookmarks/
Mymind passed four. Desktop preload/preview smoke, offline checks and production
bundles passed. Physical-device acceptance remains an explicit external gate. Current evidence and explicit physical-device gaps belong to
`docs/circe/verification.md` and the parity ledger; historical code examples in this
plan describe its kickoff revision, not the current adapter.
