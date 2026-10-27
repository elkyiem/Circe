import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";

/** A visiting device's Portless route forwards to the existing private Circé host. */
export function createCirceForwarder({
  address,
  upstream,
  request = httpsRequest,
}) {
  const local = new URL(address);
  const remote = new URL(upstream);
  if (
    [local, remote].some(
      (url) =>
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash,
    )
  )
    throw new Error("Use exact HTTPS Circé addresses.");

  return createServer((incoming, outgoing) => {
    if (
      incoming.headers.host !== local.host ||
      (incoming.headers.origin && incoming.headers.origin !== local.origin) ||
      incoming.headers["sec-fetch-site"] === "cross-site"
    ) {
      outgoing.writeHead(403).end();
      return;
    }
    const headers = { ...incoming.headers, host: remote.host };
    if (headers.origin) headers.origin = remote.origin;
    delete headers.connection;
    delete headers["proxy-authorization"];
    const forwarded = request(
      remote,
      {
        path: incoming.url,
        method: incoming.method,
        headers,
      },
      (response) => {
        const responseHeaders = { ...response.headers };
        delete responseHeaders.connection;
        if (responseHeaders.location?.startsWith(`${remote.origin}/`))
          responseHeaders.location =
            local.origin + responseHeaders.location.slice(remote.origin.length);
        outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
        response.pipe(outgoing);
      },
    );
    forwarded.on("error", () => {
      if (!outgoing.headersSent)
        outgoing.writeHead(502, {
          "content-type": "text/plain",
          "cache-control": "no-store",
        });
      outgoing.end("Circé is unreachable. Check Tailscale and the Circé host.");
    });
    outgoing.on("close", () => forwarded.destroy());
    incoming.pipe(forwarded);
  });
}

if (process.argv[1] === import.meta.filename) {
  const address = process.env.PORTLESS_URL;
  const upstream = process.env.CIRCE_REMOTE_ORIGIN ?? process.argv[2];
  const port = Number(process.env.PORT);
  if (
    !address ||
    !upstream ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error(
      "Run start:web:remote with an HTTPS Circé host address through Portless.",
    );
  const server = createCirceForwarder({ address, upstream });
  server.listen(port, "127.0.0.1", () => console.info(`Circé: ${address}`));
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.closeAllConnections();
      server.close();
    });
}
