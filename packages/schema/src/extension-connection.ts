import { z } from "zod";
import { CHROMIUM_EXTENSION_IDS, type NativeRequest } from "./native";

/** New native operations require an explicit remote-access decision. */
export const EXTENSION_REQUEST_ACCESS = {
  hello: true,
  "capture.accept": true,
  "capture.status": true,
  "library.info": true,
  "folders.list": true,
  "tags.list": true,
  "extension.settings": true,
  "session.pending": true,
  "session.import": true,
  enqueue: false,
  "files.import": false,
  "fish.list": true,
} satisfies Record<NativeRequest["type"], boolean>;

/** A separate unpacked build leaves an installed Pond extension and native host untouched. */
export const IRIS_EXTENSION_ID = "lchbfhkccifkjmfgljonbgeejejaokge";
export const IRIS_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAswUHnLj8vhztfvqIOCkFjjeY97YyV+L8UoY9p2dABMBbP14G3dlDkKKHY/Txdwnkup5+eZ/P3JaHzNgBMcRl+WqgM5e4TYQCLU9FMDl2sWfEfZeZnyfdegfxEV9D/38X3nhnozRRdSAyzkEba4FpfaUs6Yli0JGpkXfsBVegs4SkqYTbshdP80SKUc2WREMKwRcNyZg5HAtUedkUjcnCazMfQyZUeQgupSO/vgwE++pvwQjdAmDjWuoTI436kATKbUnnADlDPiZ9eWZn2LWpPwRc12j7IkL6azdzI3V6BP+Qr9C/eySnnTS1eSDaLAnCWEfN6+XWmZTCXy67o9K+hwIDAQAB";

export const ExtensionOriginSchema = z.enum(
  [...CHROMIUM_EXTENSION_IDS, IRIS_EXTENSION_ID].map(
    (id) => `chrome-extension://${id}`,
  ),
);

export const IrisHostOriginSchema = z.string().transform((value, context) => {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error("invalid_origin");
    return url.origin;
  } catch {
    context.addIssue({
      code: "custom",
      message: "Enter an HTTPS Iris address or a loopback HTTP address.",
    });
    return z.NEVER;
  }
});

export const ExtensionPairRequestSchema = z
  .object({ key: z.string().min(1).max(256), name: z.string().min(1).max(80) })
  .strict();
export const ExtensionConnectionSchema = z.object({
  origin: IrisHostOriginSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  libraryId: z.string().min(1),
  name: z.string().min(1),
  expiresAt: z.number(),
});
export type ExtensionConnection = z.infer<typeof ExtensionConnectionSchema>;
