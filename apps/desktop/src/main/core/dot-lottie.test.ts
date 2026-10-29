import JSZip from "jszip";
import { expect, it } from "vitest";
import { createDotLottie } from "./dot-lottie";

it("exports the full animation with the portable dotLottie manifest", async () => {
  const animation = {
    v: "5.7.4",
    w: 64,
    h: 64,
    layers: [],
    assets: [{ id: "asset" }],
  };
  const archive = await JSZip.loadAsync(
    await createDotLottie(Buffer.from(JSON.stringify(animation))),
  );
  expect(
    JSON.parse(
      (await archive.file("animations/animation.json")?.async("string")) ??
        "null",
    ),
  ).toEqual(animation);
  expect(
    JSON.parse(
      (await archive.file("manifest.json")?.async("string")) ?? "null",
    ),
  ).toMatchObject({ version: "1.0", animations: [{ id: "animation" }] });
});

it("rejects invalid JSON and unrelated JSON without creating a download", async () => {
  await expect(createDotLottie(Buffer.from("{"))).rejects.toThrow("valid JSON");
  await expect(
    createDotLottie(Buffer.from('{"name":"document"}')),
  ).rejects.toThrow("not a Lottie");
});
