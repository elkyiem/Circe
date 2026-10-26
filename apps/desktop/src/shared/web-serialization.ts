import { z } from "zod";

const DateValue = z.object({ $pondDate: z.iso.datetime() }).strict();
export type WebValue =
  | string
  | number
  | boolean
  | null
  | Date
  | WebValue[]
  | { [key: string]: WebValue | undefined };
type JsonValue = z.infer<ReturnType<typeof z.json>>;

/** Keep IPC Date values intact without changing Pond's stored representations. */
export function stringifyWebValue<Value>(value: Value): string {
  return JSON.stringify(
    value,
    function (
      this: Record<string, JsonValue | Date>,
      key: string,
      current: JsonValue,
    ) {
      const original = this[key];
      return original instanceof Date
        ? { $pondDate: original.toISOString() }
        : current;
    },
  );
}

export function parseWebValue(text: string): WebValue {
  return JSON.parse(text, (_key: string, value: JsonValue) => {
    const date = DateValue.safeParse(value);
    return date.success ? new Date(date.data.$pondDate) : value;
  });
}
