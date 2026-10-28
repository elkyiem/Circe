import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import { expect, it } from "vitest";
import { normalise, SavePatchSchema } from "./reconcile";

it("keeps the sensitive content result on pool saves", () => {
  const save = normalise(
    SavePatchSchema.parse({
      id: "a",
      sensitiveScore: 0.91,
      sensitiveModel: "model@revision",
    }),
  );
  expect(save?.sensitiveScore).toBe(0.91);
  expect(save?.sensitiveModel).toBe("model@revision");
  expect(save && FIELD_DESCRIPTORS.sensitiveContent.project(save)).toBe(
    "likely-sensitive",
  );
});
