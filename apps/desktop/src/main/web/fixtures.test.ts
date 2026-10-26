import { expect, it } from "vitest";
import { buildTweetCardData } from "../../shared/tweet-card";
import { fixtureCapture } from "./fixtures";

it("keeps the parent identity and quoted author in the same card input", () => {
  const capture = fixtureCapture("quote", "http://127.0.0.1:4789");
  const card = buildTweetCardData(capture);
  expect(capture.id).toBe("900000000000000001");
  expect(capture.url).toContain(capture.id);
  expect(capture.quoted?.id).toBe("900000000000000004");
  expect(card?.author.handle).toBe("iris_fixture");
  expect(card?.quoted?.author.handle).toBe("quoted_fixture");
  expect(card?.text).toBe(capture.description);
  expect(card?.quoted?.text).toBe(capture.quoted?.description);
});
it("keeps original media bound to the correct Capture and card", () => {
  for (const kind of ["image", "video"] as const) {
    const capture = fixtureCapture(kind, "http://127.0.0.1:4789");
    const card = buildTweetCardData(capture);
    expect(capture.url).toContain(capture.id);
    expect(capture.quoted).toBeUndefined();
    expect(card?.media?.[0]?.url).toBe(capture.media[0]?.url);
    expect(card?.media?.[0]?.type).toBe(kind);
    expect(card?.text).toBe(capture.description);
  }
});
