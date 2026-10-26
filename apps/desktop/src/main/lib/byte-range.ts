/** A single HTTP byte range. Multiple ranges are deliberately rejected. */
export function byteRange(
  header: string,
  total: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || total <= 0 || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if (
    (first !== null && !Number.isSafeInteger(first)) ||
    (last !== null && !Number.isSafeInteger(last))
  )
    return null;
  const start = first ?? Math.max(0, total - (last ?? 0));
  const end =
    first === null || last === null ? total - 1 : Math.min(last, total - 1);
  return start < total && start <= end ? { start, end } : null;
}
