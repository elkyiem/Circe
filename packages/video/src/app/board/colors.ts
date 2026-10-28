export const CANVAS_COLORS = [
  "gray",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "green",
] as const;

export type CanvasColor = (typeof CANVAS_COLORS)[number];

export const NOTE_FILL = {
  gray: "var(--ds-gray-3)",
  yellow: "var(--ds-yellow-3)",
  orange: "var(--ds-orange-3)",
  red: "var(--ds-red-3)",
  pink: "var(--ds-pink-3)",
  purple: "var(--ds-purple-3)",
  blue: "var(--ds-blue-3)",
  green: "var(--ds-green-3)",
} satisfies Record<CanvasColor, string>;

export const INK = {
  gray: "var(--ds-gray-12)",
  yellow: "var(--ds-yellow-9)",
  orange: "var(--ds-orange-9)",
  red: "var(--ds-red-9)",
  pink: "var(--ds-pink-9)",
  purple: "var(--ds-purple-9)",
  blue: "var(--ds-blue-9)",
  green: "var(--ds-green-9)",
} satisfies Record<CanvasColor, string>;
