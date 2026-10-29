import { expect, it } from "vitest";
import { mapConcurrent } from "./map-concurrent";

it("bounds admission and returns input order when work finishes in a different order", async () => {
  const release = Promise.withResolvers<void>();
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  const work = mapConcurrent([0, 1, 2, 3], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    started.push(value);
    if (value === 0) await release.promise;
    active--;
    return value * 2;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(peak).toBe(2);
  release.resolve();
  expect(await work).toEqual([0, 2, 4, 6]);
  expect(started).toHaveLength(4);
  expect(active).toBe(0);
});

it("stops new work after failure and waits for the admitted operation before rejecting", async () => {
  const release = Promise.withResolvers<void>();
  const failure = new Error("source failed");
  const started: number[] = [];
  let returned = false;
  const work = mapConcurrent([0, 1, 2], 2, async (value) => {
    started.push(value);
    if (value === 0) throw failure;
    await release.promise;
    return value;
  }).catch((error: Error) => {
    returned = true;
    return error;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  expect(returned).toBe(false);
  release.resolve();
  expect(await work).toBe(failure);
  expect(started).toEqual([0, 1]);
});
