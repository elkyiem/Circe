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
