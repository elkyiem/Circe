import {
  type ExtensionConnection,
  ExtensionConnectionSchema,
} from "@pond/schema/extension-connection";

/** Extension-origin IndexedDB is unavailable to page-origin content scripts. */
async function connectionDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("iris-connection", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("connection");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Couldn't open the extension connection."));
  });
}

export async function readConnection(): Promise<ExtensionConnection | null> {
  const database = await connectionDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("connection")
        .objectStore("connection")
        .get("host");
      request.onsuccess = () => {
        if (request.result == null) {
          resolve(null);
          return;
        }
        const parsed = ExtensionConnectionSchema.safeParse(request.result);
        if (parsed.success) resolve(parsed.data);
        else
          reject(
            new Error(
              "The stored Iris connection is unreadable. Reconnect the extension.",
            ),
          );
      };
      request.onerror = () =>
        reject(new Error("Couldn't read the extension connection."));
    });
  } finally {
    database.close();
  }
}

export async function writeConnection(connection: ExtensionConnection | null) {
  const database = await connectionDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("connection", "readwrite");
      const store = transaction.objectStore("connection");
      if (connection) store.put(connection, "host");
      else store.delete("host");
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(new Error("Couldn't save the extension connection."));
    });
  } finally {
    database.close();
  }
}
