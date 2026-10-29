import { expect, it } from "vitest";
import { libraryAccess } from "../core/library-access";
import { libraryResponse } from "./library-response";

it("drains the complete response body before changing the Library", async () => {
  const finish = Promise.withResolvers<void>();
  let pulls = 0;
  const response = await libraryResponse(
    new Request("https://app.test/media"),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (++pulls === 1)
              controller.enqueue(new TextEncoder().encode("original"));
            else {
              await finish.promise;
              controller.close();
            }
          },
        }),
      ),
  );
  let changed = false;
  const transition = libraryAccess.transition({
    prepare: async () => {},
    operation: async () => {
      changed = true;
    },
    keepClosed: () => false,
  });
  const bytes = response.text();
  await Promise.resolve();
  expect(changed).toBe(false);
  finish.resolve();
  expect(await bytes).toBe("original");
  await transition;
  expect(changed).toBe(true);
});

it("releases the response lease when the consumer cancels or its request aborts", async () => {
  for (const reason of ["consumer", "request"]) {
    const controller = new AbortController();
    let cancelled = false;
    const response = await libraryResponse(
      new Request("https://app.test/media", { signal: controller.signal }),
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    if (reason === "consumer") await response.body?.cancel();
    else controller.abort();
    await libraryAccess.transition({
      prepare: async () => {},
      operation: async () => {
        expect(cancelled).toBe(true);
      },
      keepClosed: () => false,
    });
  }
});

it("propagates a source failure and releases its lease", async () => {
  const response = await libraryResponse(
    new Request("https://app.test/media"),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error("original disappeared"));
          },
        }),
      ),
  );
  await expect(response.text()).rejects.toThrow("original disappeared");
  await libraryAccess.transition({
    prepare: async () => {},
    operation: async () => {},
    keepClosed: () => false,
  });
});
