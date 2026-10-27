import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, ...addresses] = process.argv.slice(2);
if (mode !== "host" && mode !== "remote")
  throw new Error("Choose the host or remote Circé address launcher.");

// Resolve the pinned CLI directly so the launcher also works on Windows.
const portless = fileURLToPath(
  new URL("./cli.js", import.meta.resolve("portless")),
);
const host = mode === "host";
const child = spawn(
  process.execPath,
  [
    portless,
    "circe",
    ...(host ? ["--app-port", "4789", "--tailscale"] : []),
    process.execPath,
    fileURLToPath(
      new URL(host ? "./start-web.mjs" : "./forward-web.mjs", import.meta.url),
    ),
    ...addresses,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, PORTLESS_TLD: "elkyiem" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
