import { libraryAccess } from "../core/library-access";

interface HostEvent {
  event: string;
  data: string;
}

/** Temporary quiescence keeps the stream and UI alive; only the original Library may receive queued events. */
export function createWebEventQueue(dependencies: {
  sessionValid(): boolean;
  scopeCurrent(): boolean;
  write(event: HostEvent): Promise<void>;
  abort(): void;
}) {
  const pending: HostEvent[] = [];
  let bytes = 0;
  let closed = false;
  let started = false;
  let draining = false;
  const encoder = new TextEncoder();
  function valid() {
    try {
      if (closed || !dependencies.sessionValid()) return false;
      // Resolving Library paths is forbidden while the database is sealed.
      return !libraryAccess.isOpen() || dependencies.scopeCurrent();
    } catch {
      return false;
    }
  }
  function abort() {
    if (closed) return;
    closed = true;
    pending.length = 0;
    bytes = 0;
    offReopen();
    dependencies.abort();
  }
  async function flush() {
    if (!valid()) {
      abort();
      return;
    }
    if (draining || !started || !libraryAccess.isOpen()) return;
    draining = true;
    try {
      while (pending.length && !closed && libraryAccess.isOpen()) {
        if (!valid()) {
          abort();
          return;
        }
        const event = pending.shift();
        if (!event) break;
        bytes -= encoder.encode(event.event + event.data).byteLength;
        await dependencies.write(event);
      }
    } catch {
      abort();
    } finally {
      draining = false;
    }
  }
  const offReopen = libraryAccess.onReopen(() => {
    void flush();
  });
  return {
    valid,
    offer(event: HostEvent) {
      if (!valid()) {
        abort();
        return;
      }
      bytes += encoder.encode(event.event + event.data).byteLength;
      if (pending.length >= 5000 || bytes > 32 * 1024 * 1024) {
        abort();
        return;
      }
      pending.push(event);
      void flush();
    },
    start() {
      started = true;
      void flush();
    },
    dispose() {
      closed = true;
      pending.length = 0;
      bytes = 0;
      offReopen();
    },
  };
}
