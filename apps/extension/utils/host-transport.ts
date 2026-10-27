import {
  CirceHostOriginSchema,
  type ExtensionConnection,
  ExtensionConnectionSchema,
} from "@pond/schema/extension-connection";
import {
  type NativeRequest,
  type NativeResponse,
  nativeResponseSchema,
} from "@pond/schema/native";

export function createHostTransport({
  read,
  fetch: request,
  native,
  extension,
}: {
  read(): Promise<ExtensionConnection | null>;
  fetch: typeof fetch;
  native(input: NativeRequest): Promise<NativeResponse>;
  extension: string;
}) {
  const headers = (connection: ExtensionConnection) => ({
    "content-type": "application/json",
    "x-iris-extension": extension,
    "x-iris-library": connection.libraryId,
    authorization: `Bearer ${connection.token}`,
  });
  return {
    async call(input: NativeRequest): Promise<NativeResponse> {
      let connection: ExtensionConnection | null;
      try {
        connection = await read();
      } catch {
        return { ok: false, error: "iris_auth_required" };
      }
      if (!connection) return native(input);
      if (connection.expiresAt <= Date.now())
        return { ok: false, error: "iris_auth_required" };
      try {
        const body = JSON.stringify(input);
        if (new TextEncoder().encode(body).length > 8 * 1024 * 1024)
          return { ok: false, error: "too_large" };
        const response = await request(
          `${connection.origin}/extension/request`,
          {
            method: "POST",
            headers: headers(connection),
            body,
            credentials: "omit",
            redirect: "error",
            signal: AbortSignal.timeout(60000),
          },
        );
        if (response.status === 401)
          return { ok: false, error: "iris_auth_required" };
        if (response.status === 409)
          return { ok: false, error: "iris_library_changed" };
        const parsed = nativeResponseSchema.safeParse(await response.json());
        return parsed.success
          ? parsed.data
          : { ok: false, error: "iris_invalid_response" };
      } catch {
        return { ok: false, error: "iris_offline" };
      }
    },
    async pair(origin: string, key: string, name: string) {
      const host = CirceHostOriginSchema.parse(origin);
      const previous = await read().catch(() => null);
      const pairHeaders = new Headers({
        "content-type": "application/json",
        "x-iris-extension": extension,
      });
      if (previous?.origin === host)
        pairHeaders.set("authorization", `Bearer ${previous.token}`);
      const response = await request(`${host}/extension/pair`, {
        method: "POST",
        headers: pairHeaders,
        body: JSON.stringify({ key, name }),
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "The access key was not accepted."
            : response.status === 429
              ? "Too many attempts. Try again in five minutes."
              : "Couldn't pair. Check the Circé address and try again.",
        );
      const connection = ExtensionConnectionSchema.parse(await response.json());
      if (connection.origin !== host)
        throw new Error("The host returned a different Circé address.");
      return connection;
    },
    async revoke(connection: ExtensionConnection) {
      const response = await request(`${connection.origin}/extension/pair`, {
        method: "DELETE",
        headers: headers(connection),
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status !== 401)
        throw new Error(
          "Couldn't disconnect. Reconnect to the host and try again.",
        );
    },
  };
}
