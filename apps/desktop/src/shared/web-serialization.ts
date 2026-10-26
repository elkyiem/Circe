import { z } from "zod";

const DateValue = z.object({ $pondDate: z.iso.datetime() }).strict();
const ByteValue = z
  .object({ $pondBytes: z.array(z.number().int().min(0).max(255)) })
  .strict();
export type WebValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Uint8Array
  | WebValue[]
  | { [key: string]: WebValue | undefined };
type JsonValue = z.infer<ReturnType<typeof z.json>>;

/** Keep IPC Date values intact without changing Pond's stored representations. */
export function stringifyWebValue<Value>(value: Value): string {
  return JSON.stringify(
    value,
    function (
      this: Record<string, JsonValue | Date | Uint8Array>,
      key: string,
      current: JsonValue,
    ) {
      const original = this[key];
      if (original instanceof Uint8Array)
        return { $pondBytes: Array.from(original) };
      return original instanceof Date
        ? { $pondDate: original.toISOString() }
        : current;
    },
  );
}

export function parseWebValue(text: string): WebValue {
  return JSON.parse(text, (_key: string, value: JsonValue) => {
    const date = DateValue.safeParse(value);
    if (date.success) return new Date(date.data.$pondDate);
    const bytes = ByteValue.safeParse(value);
    return bytes.success ? new Uint8Array(bytes.data.$pondBytes) : value;
  });
}
