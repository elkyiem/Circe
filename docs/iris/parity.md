# Feature parity ledger

Baseline: Pond 1.6.3 at `0e9dc817e17baafe60d9151a7fc49be5dc3e0861`.
Long-term objective: the full Pond application in desktop and mobile browsers.

| Capability | Current boundary | Evidence / remaining work |
| --- | --- | --- |
| Actual Pond renderer and shared design system | Browser | Production browser build passes; same feature imports, CSS Modules, theme and components |
| Library pages, pagination and keyword search | Host-backed | Real Library pagination over HTTP; actual browser search, cards and reload passed |
| Save details and existing viewers | Browser + host media | Image and video viewers opened through the shared renderer; details and folder picker exercised |
| Thumbnails, full images and video ranges | Host-backed | Real persisted image/video, HEAD, 206, suffix ranges, 416 and unauthorized requests verified |
| Folder create, add and remove | Host-backed | Actual browser create/add/remove/re-add passed; persisted membership verified after host restart |
| Saved Views and folder rules | Host-backed reads | Existing saved representations retained; browser editing deferred |
| Durable ingest and job settlement | Electron host | Image/video fixtures completed through existing reconciler, workers and finalize |
| Twitter quoted Capture | Host-backed | Browser enqueue, nested author/ID/card-input tests and persisted source.json identity verified |
| Original Twitter image/video files | Host-backed | Original sourceUrl matches Capture media; both native card PNGs persist; HTTP smoke passed |
| Account sessions and source collectors | Electron host | Original implementation retained; no live session connected or live sync claimed |
| Authentication, logout and origin policy | Browser + host | Focused HTTP tests pass; random private key and session cookie |
| Events and progress | SSE + existing Downloads | SyncAction delivery/cleanup tested; real queue completion, visible enqueue and host-disconnected states verified |
| Native dialogs, host file paths, detached windows | Needs browser equivalent/helper | Explicit capability error; visiting-device file ingest deferred |
| Archive replay, Agent streaming and credential settings | Deferred | Not exposed through browser allowlist; no streaming parity claim |
| On-device inference | Deferred browser adapters | Existing code retained; default browser enrichment is off; no closed-tab processing claim |
| Mobile composition and touch workflows | Browser | Chromium at 390×844: library, viewer, decoded video frames and reload passed; physical phone/touch testing remains |
| Tailscale HTTPS access | Deployment follow-up | Exact-origin configuration designed; remote access unverified |
| Electron-free runtime / Linux service | Deferred | Requires concrete host runtime replacements |

Browser workflow evidence comes from a finite Chromium BrowserWindow without a
preload bridge or Node integration, at 1280×900 and 390×844. The collaborative
Chrome sign-in form was checked separately, including the repaired click target;
its signed-in manual workflow is not claimed. See [verification](verification.md).

Next milestone after this verified slice: connect one explicitly authorized test
Account on the isolated host and verify live collection end to end; then visiting
device uploads and broader browser capability coverage. Preserve existing PNG and
media viewing for Twitter; an interactive tweet viewer is a separate product
change.
