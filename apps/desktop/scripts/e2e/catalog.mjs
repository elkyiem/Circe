/** Existing finite fixtures stay independently runnable and own their temporary Libraries. */
export const suites = [
  {
    id: "desktop-startup",
    runtime: "electron",
    script: "smoke-desktop.cjs",
    timeoutMs: 60000,
  },
  {
    id: "desktop-chat-stream",
    runtime: "electron",
    script: "smoke-agent-stream.cjs",
    timeoutMs: 90000,
  },
  {
    id: "desktop-reviewed-operations",
    runtime: "electron",
    script: "smoke-agent-operations.cjs",
    timeoutMs: 90000,
  },
  {
    id: "desktop-folder-rules",
    runtime: "electron",
    script: "smoke-folder-tags.cjs",
    timeoutMs: 90000,
  },
  {
    id: "desktop-library-trust",
    runtime: "electron",
    script: "smoke-library-trust.cjs",
    timeoutMs: 90000,
  },
  {
    id: "parity",
    runtime: "electron",
    script: "smoke-upstream-parity.cjs",
    timeoutMs: 420000,
  },
  {
    id: "live",
    runtime: "electron",
    script: "smoke-upstream-parity.cjs",
    timeoutMs: 420000,
    env: { CIRCE_E2E_LIVE: "1" },
    live: true,
  },
  {
    id: "browser",
    runtime: "node",
    script: "smoke-web-ci.mjs",
    timeoutMs: 1200000,
    ciOnly: true,
  },
];
