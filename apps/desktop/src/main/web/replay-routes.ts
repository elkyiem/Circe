import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RouteStore } from "portless";

/** Each replay owns only its random route; application and sibling routes are never replaced. */
export function createReplayRoutes(input: {
  appHostname: string;
  domain: string;
  port: number;
  stateDirectory?: string;
}) {
  const domain = input.domain.toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
    !domain
      .split(".")
      .every(
        (label) =>
          label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      ) ||
    domain.length > 180 ||
    domain.includes("..") ||
    domain === input.appHostname ||
    domain.endsWith(`.${input.appHostname}`) ||
    input.appHostname.endsWith(`.${domain}`)
  )
    throw new Error(
      "Replay needs a separate domain from the Circé application.",
    );
  let store: RouteStore | null = null;
  let opening: Promise<RouteStore> | null = null;
  let closed = false;
  const owned = new Set<string>();
  async function getStore() {
    opening ??= import("portless")
      .then(({ RouteStore: Store }) => {
        const next = new Store(
          input.stateDirectory ??
            process.env.PORTLESS_STATE_DIR ??
            join(homedir(), ".portless"),
        );
        const application = next
          .loadRoutes()
          .find((route) => route.hostname === input.appHostname);
        if (!application || application.port !== input.port)
          throw new Error(
            "Start the Circé host through its Portless address before opening an archive.",
          );
        store = next;
        return next;
      })
      .catch((error: Error) => {
        opening = null;
        throw error;
      });
    return opening;
  }
  return {
    async register() {
      if (closed) throw new Error("Archive replay is stopping.");
      const routes = await getStore();
      if (closed) throw new Error("Archive replay is stopping.");
      const hostname = `r-${randomBytes(18).toString("hex")}.${domain}`;
      routes.addRoute(hostname, input.port, process.pid);
      owned.add(hostname);
      return hostname;
    },
    remove(hostname: string) {
      if (!owned.has(hostname)) return;
      store?.removeRoute(hostname, process.pid);
      owned.delete(hostname);
    },
    close() {
      closed = true;
      const errors: Error[] = [];
      for (const hostname of owned) {
        try {
          store?.removeRoute(hostname, process.pid);
          owned.delete(hostname);
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error
              : new Error("A replay route could not be removed."),
          );
        }
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Replay routes could not finish stopping.",
        );
    },
  };
}
