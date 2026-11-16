const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { saveCases } = require("./save-cases.cjs");
const { organizationCases } = require("./organization-cases.cjs");
const { canvasFishCases } = require("./canvas-fish-cases.cjs");
const { sourceCases } = require("./source-cases.cjs");
const { libraryCases } = require("./library-cases.cjs");
const { downloadsCases } = require("./downloads-cases.cjs");
const { inboxHealthCases } = require("./inbox-health-cases.cjs");

const cases = [
  ...saveCases,
  ...organizationCases,
  ...canvasFishCases,
  ...sourceCases,
  ...libraryCases,
  ...downloadsCases,
  ...inboxHealthCases,
];
exports.sharedCases = cases;

/** Each scenario runs unchanged across the real preload and authenticated browser adapter. */
exports.verifySharedFeatures = async (controls) => {
  const { run, snapshot, directory, mode } = controls;
  const scenarios = controls.cases ?? cases;
  const outcomes = {};
  const results = [];
  const saveReport = () =>
    writeFileSync(
      join(directory, `${mode}-${controls.cases ? "live" : "features"}.json`),
      JSON.stringify({ mode, results }, null, 2),
    );
  for (const scenario of scenarios) {
    const started = Date.now();
    const observed = new Set();
    const query = (name, params = {}) => {
      observed.add(name);
      return run(
        `window.pond.query(${JSON.stringify(name)},${JSON.stringify(params)})`,
      );
    };
    try {
      const outcome = await scenario.verify({
        ...controls,
        query,
        nonce: randomUUID(),
      });
      for (const name of scenario.queries)
        assert.ok(
          observed.has(name),
          `${scenario.id} did not exercise ${name}`,
        );
      outcomes[scenario.id] = outcome;
      results.push({
        id: scenario.id,
        status: "passed",
        durationMs: Date.now() - started,
        queries: [...observed].sort(),
        outcome,
      });
      saveReport();
      console.log("E2E_CASE_PASSED", mode, scenario.id);
    } catch (error) {
      results.push({
        id: scenario.id,
        status: "failed",
        durationMs: Date.now() - started,
        error: error.stack ?? String(error),
      });
      saveReport();
      await snapshot(`${mode}-${scenario.id}-failed`);
      throw error;
    }
  }
  return outcomes;
};
