# Desktop and browser regression suite

`pnpm e2e` runs finite desktop and shared desktop/browser scenarios against built
bundles. It creates disposable Libraries and app profiles, requires a desktop
session, and leaves the shared development runtime alone. Build first:

```sh
pnpm build
pnpm --filter @pond/desktop build:web
pnpm e2e
```

On Linux without a desktop session, use `xvfb-run -a pnpm e2e`. The runner clears
`ELECTRON_RUN_AS_NODE` and development renderer URLs for its children. It runs
sequentially, bounds each fixture's lifetime, stops its process tree on timeout or
cancellation, and exits nonzero on failure. It does not retry failing scenarios.
Never point fixture scripts at a personal Library.

```sh
pnpm e2e --list
pnpm e2e --suite=parity
pnpm e2e --suite=desktop-startup,desktop-chat-stream
pnpm e2e:coverage
```

`pnpm e2e:ci` additionally runs the existing isolated browser integration suite
in CI. That runner owns its temporary host and exits after verification. Local
chats must use the designated shared host for the browser-only scripts, following
the [runbook](runbook.md#verification); setting `CI=1` locally does not authorize
starting another host. No dev or watch command belongs in E2E verification.

## What runs

- Desktop startup, detached image preview, preload reads, offline chat streaming
  and cancellation, reviewed operations and Undo, folder rules and transfers,
  backup manifests, and Library trust checks use the existing smoke fixtures.
- Shared scenarios in `apps/desktop/scripts/e2e/` run unchanged through native
  `window.pond` preload and the browser's real authenticated HTTP adapter. They
  assert edits, Unicode Tags and Tag Groups, folder hierarchy and membership,
  rule application, Saved Views and Smart Folders, Canvas persistence and stale
  write rejection, Fish/chat lifecycle, preferences, paginated retrieval, visible
  search results, reload, trash, restore, and purge. A loopback RSS server exercises
  real Watch creation, Source scheduling and incoming rules, harvesting, repeated
  Sync deduplication, persisted Sync history, and removal on both transports.
  Pipeline and per-Source pause/resume, plus persisted bulk-edit Undo/Redo, are also
  shared scenarios. Normalized outcomes must
  match across both surfaces, in addition to each scenario's expected assertions.
- Pond 2.4–2.7 additions run as shared scenarios too: keyword search staying
  inside folder and Trash scope, Fetch All and Fetch on Launch, new Source saves
  filed into the Source's folder, purged items not fetched again, source-gate
  hourly/daily limits, Library logo cropping and Pond tints, the Check for
  Updates dialog, the Canvas minimap, and offline Download dialog validation.
  UI scenarios navigate with `e2e/navigation.cjs` and save a screenshot per
  surface.
- Pond 2.8 additions run as shared scenarios: Quick Add capturing into the Inbox
  and a chosen folder, folder previews, Inbox processing with scoped toast
  Undo/Redo steps (including a stale step refused under a newer favorite and
  global Undo reporting its step), Library Health check/recheck/poster retry,
  the host's app icon appearance, and Split Posts after a carousel split. A UI
  tour opens the Inbox review deck, runs Check Library, and screenshots the
  Library settings (Inbox and Devices groups) and Split Posts on both surfaces.
  `pnpm e2e:live` also exports a page's files to the Library and to a folder
  (desktop) or as one zip download (browser). The ring over other apps is a
  host-screen window, so browser Settings hide it.
- Existing upstream parity scenarios cover carousel and batch splitting, media
  filename encoding, sensitivity overrides, video seeking, keyboard playback,
  arrow-key volume, click-to-pause, setting a carousel image as the thumbnail,
  Are.na conversion and progress, missing originals, repair previews, displaced
  Library recovery, and durable transfer dismissal on both surfaces.
- The browser CI suite retains its HTTP, session, stale history, upload/download,
  import/export, conversion, Canvas, extension, connection, responsive browser UI,
  identity, release, Sources, Fish and chat checks. These are browser integration
  coverage; they do not imply every native UI gesture has a parity test.

The browser exercised here is Electron's sandboxed Chromium renderer with no
preload. Firefox, Safari, real phone touch/clipboard behavior, OS file dialogs,
native sharing/font installation, model quality, and signed-in Source Sync still
need their dedicated checks. Live provider, model download and source drift tests
stay separate from offline regression checks. `apps/website` is the marketing site;
the web app under test is Circé's browser renderer in `apps/desktop`.

## Coverage is an explicit backlog

`apps/desktop/scripts/e2e/coverage.json` records every query's browser access,
its shared scenarios (or `pending`), and the renderer route files. An offline
test in `pnpm check` fails when an upstream sync adds, removes, reclassifies, or
renames a query/route, or changes a scenario's declared query coverage.

The parity suite declares the queries it asserts in `e2e/parity-scenario.cjs`;
the inventory counts them and the suite fails if one is not exercised.

`pending` means a shared behavior assertion is still needed. Existing browser or
unit tests may cover that operation, but it is not counted as shared parity.
Host-classified queries can also have dedicated browser endpoints; classification
alone is not evidence that a feature is desktop-only. `pnpm e2e:coverage` lists
every gap. A green run proves only the listed scenarios, never “all features.”

After **each upstream sync**:

1. Read the upstream feature and bug-fix diff, including UI and event changes that
   introduce no query or route. The inventory guard cannot infer those changes.
2. Add a scenario for each new behavior or fix. Give it a stable descriptive ID,
   declare the queries it exercises, and assert expected persisted and visible
   behavior. Use fixtures and loopback data, never accounts or provider keys.
3. Add shared scenarios to the appropriate `e2e/*-cases.cjs` file and register new
   case modules in `shared-cases.cjs`. Every declared query must execute during
   that scenario. Normalize random IDs/timestamps out of returned outcomes.
4. Review the changed entries in `coverage.json`. Associate queries with the
   scenario IDs; explicitly leave unsupported/unimplemented assertions `pending`
   and describe the limitation in the sync PR. Do not blanket-refresh the ledger
   to silence a failure. Remove entries only when the product operation was removed.
5. Run `pnpm check`, rebuild both bundles, and run `pnpm e2e`. The Circé CI workflow
   runs the extended browser suite on PRs and pushes to `web` and `dev`.

## Live suite

`pnpm e2e:live` runs scenarios that need real binaries or provider APIs, on the
desktop preload and the authenticated browser, in a disposable Library. It is
never part of `pnpm e2e`. It reuses a yt-dlp Pond already installed (the Circé
sandbox or `~/Library/Application Support/Pond/bin`) and otherwise downloads it.
The native folder picker and Finder are replaced in the harness's main process,
so the real `downloader.pickExportFolder` and `downloader.reveal` queries run
unattended; browser downloads are saved into the sandbox.

- `live.downloader-probe-download-export`: probes a local `.mp4` and YouTube's
  19-second "Me at the zoo", samples frames, downloads it into the Library at
  240p, exports M4A audio (a host file on desktop, a browser download on the
  web) and checks Reveal.
- `live.mymind-rejects-invalid-key`: the real mymind API rejects a well-formed
  unknown key and no Source is created.
- `live.mymind-connect-and-sync` runs only with a real read-only key supplied as
  files: `CIRCE_E2E_MYMIND_KID_FILE=… CIRCE_E2E_MYMIND_SECRET_FILE=… pnpm e2e:live`.
  It connects, waits for an error-free import, and disconnects.

Known upstream issue: Add to Library from the Download dialog fails for a bare
media link (`.mp4`): the probe succeeds, but the web harvest rejects the
non-HTML response (`web fetch non-html content-type`). Site links work.

Prioritize remaining shared coverage for full Canvas editing/export, keyboard
selection and Undo/Redo, signed-in Source Sync and Downloads recovery, imports and exports,
Library lifecycle/backup/restore, offline reconnect, archive replay, and settings
UI across breakpoints. Add genuine browser-engine CI jobs when their harnesses
exist; Chromium platform emulation is not a Safari or Windows test.

## Evidence

The runner writes `.artifacts/e2e/results.json`, `junit.xml`, and one log per suite.
Shared scenarios write per-case durations, observed queries, expected outcomes and
errors to `.artifacts/web-verification/upstream-231/{desktop,web}-features.json`.
Failures also capture renderer text and screenshots with the scenario ID.
Circé CI uploads reports and screenshots on success and failure for seven days.
Each run replaces its suite logs and summary; archive evidence before another run
if you need to compare runs.
