import { AsyncLocalStorage } from "node:async_hooks";

export class LibraryTransitionError extends Error {
  constructor(
    message = "The Library is reopening. Reconnect when it is ready.",
  ) {
    super(message);
  }
}

/** Request leases cover async work; transitions drain them before changing paths. */
export function createLibraryAccess() {
  interface Scope {
    active: boolean;
    kind: "request" | "transition";
    parent?: Scope;
  }
  const context = new AsyncLocalStorage<Scope>();
  const waiting = new Set<() => void>();
  const reopened = new Set<() => void>();
  let readers = 0;
  let blocked = false;
  let sealed = false;
  function release(scope: Scope) {
    if (!scope.active) return;
    scope.active = false;
    if (scope.kind === "request") readers--;
    if (readers === 0) for (const resolve of waiting) resolve();
  }
  return {
    onReopen(listener: () => void) {
      reopened.add(listener);
      return () => {
        reopened.delete(listener);
      };
    },
    isOpen() {
      return !blocked;
    },
    /** A previously admitted request may finish, but cannot start a new background run. */
    assertNewWorkAllowed() {
      if (blocked) throw new LibraryTransitionError();
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      const parent = context.getStore();
      if (blocked && !parent?.active) throw new LibraryTransitionError();
      const scope: Scope = { active: true, kind: "request", parent };
      readers++;
      try {
        return await context.run(scope, operation);
      } finally {
        release(scope);
      }
    },
    /** A location request cannot count itself among the requests it must drain. */
    releaseCurrent() {
      let scope = context.getStore();
      while (scope) {
        if (scope.kind === "transition") throw new LibraryTransitionError();
        release(scope);
        scope = scope.parent;
      }
    },
    async transition<T>(dependencies: {
      prepare: () => Promise<void>;
      operation: () => Promise<T>;
      keepClosed: () => boolean;
      drainTimeoutMs?: number;
    }): Promise<T> {
      const scope: Scope = { active: true, kind: "transition" };
      blocked = true;
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new LibraryTransitionError(
                  "Finish or cancel the current Library action, then try again.",
                ),
              ),
            dependencies.drainTimeoutMs ?? 15_000,
          );
          Promise.resolve()
            .then(dependencies.prepare)
            .then(
              () => {
                clearTimeout(timer);
                resolve();
              },
              (error) => {
                clearTimeout(timer);
                reject(error);
              },
            );
        });
        if (readers > 0)
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              clearTimeout(timer);
              waiting.delete(done);
              resolve();
            };
            const timer = setTimeout(() => {
              waiting.delete(done);
              reject(
                new LibraryTransitionError(
                  "Finish or cancel the current Library action, then try again.",
                ),
              );
            }, dependencies.drainTimeoutMs ?? 15_000);
            waiting.add(done);
          });
        waiting.clear();
        return await context.run(scope, dependencies.operation);
      } finally {
        scope.active = false;
        if (!dependencies.keepClosed()) {
          sealed = false;
          blocked = false;
          for (const listener of reopened) {
            try {
              listener();
            } catch (error) {
              console.error("[pond] Library resume subscriber failed", error);
            }
          }
        }
      }
    },
    sealDatabase() {
      if (blocked) sealed = true;
    },
    assertDatabaseAvailable() {
      if (sealed && !context.getStore()?.active)
        throw new LibraryTransitionError();
    },
  };
}

export const libraryAccess = createLibraryAccess();
