export const PARTITION = "persist:pond-scrapers";
/** Isolated from the shared and per-account jars so a public read can never ride or pollute a signed-in session. */
export const PUBLIC_PARTITION = "persist:pond-watch-public";
export const NAV_TIMEOUT_MS = 25_000;
export const HARVEST_TIMEOUT_MS = 20_000;

/** Chromium reports its real version in Sec-CH-UA; bot walls such as Akamai reject a user agent that disagrees. */
export function browserUserAgent(): string {
  return (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    `(KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
  );
}
