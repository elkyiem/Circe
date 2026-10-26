function clampTrack(width: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** How far past the minimum width a drag must travel before it collapses the track. */
const COLLAPSE_OVERSHOOT = 48;

export function nextTrackWidth(input: {
  edge: "left" | "right";
  startWidth: number;
  startX: number;
  clientX: number;
  min: number;
  max: number;
  collapseAtMin?: boolean;
}): number | null {
  const delta = input.clientX - input.startX;
  const raw =
    input.edge === "left" ? input.startWidth + delta : input.startWidth - delta;
  if (input.collapseAtMin && raw <= input.min - COLLAPSE_OVERSHOOT) return null;
  return clampTrack(raw, input.min, input.max);
}
