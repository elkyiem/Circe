const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function junit(results) {
  const failures = results.filter(
    (result) => result.status === "failed",
  ).length;
  const cases = results
    .map(
      (result) =>
        `<testcase classname="circe.e2e" name="${escapeXml(result.id)}" time="${result.durationMs / 1000}">${result.status === "failed" ? `<failure message="${escapeXml(result.error ?? `Exit ${result.exitCode}`)}">${escapeXml(result.logPath)}</failure>` : ""}</testcase>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Circe E2E" tests="${results.length}" failures="${failures}">\n${cases}\n</testsuite>\n`;
}
