import { z } from "zod";

const Port = z.coerce.number().int().min(1).max(65535);
const Origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.hostname.includes("*") &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}, "Circé origins must be exact HTTPS origins or loopback HTTP origins.");

/** Portless supplies its assigned port and exact URLs before launching the host. */
export function webHostConfig(env: NodeJS.ProcessEnv) {
  const port = Port.parse(
    env.CIRCE_WEB_PORT ?? env.IRIS_WEB_PORT ?? env.PORT ?? 4789,
  );
  const origin = Origin.parse(
    env.CIRCE_WEB_ORIGIN ?? env.IRIS_WEB_ORIGIN ?? `http://127.0.0.1:${port}`,
  );
  const origins = [
    ...(env.CIRCE_WEB_ORIGINS ?? env.IRIS_WEB_ORIGINS ?? "").split(","),
    env.PORTLESS_URL,
    env.PORTLESS_TAILSCALE_URL,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => Origin.parse(value));
  return { port, origin, origins: [...new Set(origins)] };
}
