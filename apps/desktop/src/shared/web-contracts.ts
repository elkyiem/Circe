import { z } from "zod";
import { WEB_QUERY_ACCESS, type WebQueryName } from "./web-capabilities";

const names = Object.entries(WEB_QUERY_ACCESS)
  .filter(([, access]) => access === "read" || access === "write")
  .map(([name]) => name);
const allowedNames = z.enum(names);
/** The membership test narrows names to the explicitly classified transport operations. */
export const WebQueryNameSchema = z.custom<WebQueryName>(
  (value) => allowedNames.safeParse(value).success,
);
export const WebQueryRequestSchema = z
  .object({
    name: WebQueryNameSchema,
    params: z.record(z.string(), z.json()).optional(),
    libraryId: z.string().min(1).optional(),
  })
  .strict();
export const WebSessionSchema = z.object({
  libraryId: z.string(),
  fixtures: z.boolean(),
});
export const WebFixtureSchema = z.enum(["quote", "image", "video"]);
