import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WEB_QUERY_ACCESS } from "../../src/shared/web-capabilities.ts";
import { sharedCases } from "./shared-cases.cjs";

const inventoryUrl = new URL("./coverage.json", import.meta.url);

async function currentCoverage() {
  const routes = await readdir(
    new URL("../../src/renderer/src/routes/", import.meta.url),
    { recursive: true },
  );
  const queries = Object.fromEntries(
    Object.entries(WEB_QUERY_ACCESS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, access]) => {
        const scenarios = sharedCases
          .filter((scenario) => scenario.queries.includes(name))
          .map((scenario) => scenario.id);
        return [
          name,
          `${access}:${scenarios.length ? scenarios.join(",") : "pending"}`,
        ];
      }),
  );
  return {
    queries,
    routes: routes
      .filter((path) => path.endsWith(".tsx"))
      .map((path) => path.replaceAll("\\", "/"))
      .sort(),
  };
}

export async function checkCoverage() {
  const recorded = JSON.parse(await readFile(inventoryUrl, "utf8"));
  const current = await currentCoverage();
  assert.deepEqual(
    current,
    recorded,
    `E2E inventory changed. Add regression assertions for new/changed capabilities and routes, then review ${fileURLToPath(inventoryUrl)}. 'pending' is an acknowledged gap, never a passing test.`,
  );
  return current;
}

export function coverageSummary(inventory) {
  const entries = Object.entries(inventory.queries);
  const pending = entries
    .filter(([, value]) => value.endsWith(":pending"))
    .map(([name]) => name);
  return {
    totalQueries: entries.length,
    sharedScenarioQueries: entries.length - pending.length,
    pendingQueries: pending,
    routeFiles: inventory.routes.length,
    scenarios: sharedCases.map((scenario) => ({
      id: scenario.id,
      queries: scenario.queries,
    })),
  };
}
