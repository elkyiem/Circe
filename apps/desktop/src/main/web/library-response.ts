import { libraryAccess } from "../core/library-access";

/** A streamed response keeps its Library lease until bytes settle or the caller disconnects. */
export function libraryResponse(
  request: Request,
  operation: () => Promise<Response>,
): Promise<Response> {
  const ready = Promise.withResolvers<Response>();
  void libraryAccess
    .run(async () => {
      try {
        const response = await operation();
        if (!response.body) {
          ready.resolve(response);
          return;
        }
        const reader = response.body.getReader();
        const finished = Promise.withResolvers<void>();
        let ended = false;
        const finish = () => {
          if (ended) return;
          ended = true;
          request.signal.removeEventListener("abort", abort);
          finished.resolve();
        };
        const abort = () => {
          void reader
            .cancel()
            .catch(() => {})
            .finally(finish);
        };
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const next = await reader.read();
              if (next.done) {
                controller.close();
                finish();
              } else controller.enqueue(next.value);
            } catch (error) {
              controller.error(error);
              finish();
            }
          },
          async cancel(reason) {
            try {
              await reader.cancel(reason);
            } finally {
              finish();
            }
          },
        });
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) abort();
        ready.resolve(
          new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        );
        await finished.promise;
      } catch (error) {
        ready.reject(error);
      }
    })
    .catch(ready.reject);
  return ready.promise;
}
