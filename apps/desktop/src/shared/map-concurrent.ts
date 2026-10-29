/** Stop scheduling after failure, but settle every admitted operation before the caller cleans up. */
export async function mapConcurrent<Value, Result>(
  values: readonly Value[],
  concurrency: number,
  operation: (value: Value, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("Concurrency must be a positive integer.");
  const iterator = values.entries();
  const results: Result[] = [];
  let failure: Error | null = null;
  const worker = async () => {
    while (failure === null) {
      const next = iterator.next();
      if (next.done) return;
      const [index, value] = next.value;
      try {
        results[index] = await operation(value, index);
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  if (failure !== null) throw failure;
  return results;
}
