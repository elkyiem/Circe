import { cssVars } from "@pond/ui";
import { useStore, ViewportPortal } from "@xyflow/react";
import { useCanvasInterfaceScale } from "../../lib/interface-scale";
import type { Guide } from "../../lib/snap";
import styles from "./styles.module.css";

interface GuidesProps {
  guides: readonly Guide[];
}

export function Guides({ guides }: GuidesProps) {
  const interfaceScale = useCanvasInterfaceScale();
  const zoom = useStore((state) => state.transform[2]) / interfaceScale;
  if (!guides.length) return null;
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.at}`}
          className={styles.guide}
          data-axis={guide.axis}
          style={cssVars({
            "--guide-at": `${guide.at}px`,
            "--guide-from": `${guide.from}px`,
            "--guide-length": `${guide.to - guide.from}px`,
            "--guide-width": `${1 / zoom}px`,
          })}
        />
      ))}
    </ViewportPortal>
  );
}
