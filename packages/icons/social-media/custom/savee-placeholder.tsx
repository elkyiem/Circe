import type { SVGProps } from "react";

/** @todo Replace with Savee's real mark; Simple Icons has none, so this neutral tile stands in. */
export function IconBrandSaveePlaceholder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 370 370"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Savee"
      {...props}
    >
      <title>Savee</title>
      <rect width="370" height="370" fill="#111111" />
      <rect x="111" y="111" width="148" height="148" rx="32" fill="white" />
    </svg>
  );
}
