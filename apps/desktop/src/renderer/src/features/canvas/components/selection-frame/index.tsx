import { cssVars } from "@pond/ui";
import {
  type Rect,
  useReactFlow,
  useStore,
  ViewportPortal,
  type XYPosition,
} from "@xyflow/react";
import { useRef } from "react";
import { useCanvasInterfaceScale } from "../../lib/interface-scale";
import { CORNERS, type Corner } from "../../lib/transform";
import styles from "./styles.module.css";

interface SelectionFrameProps {
  frame: Rect;
  resizable: boolean;
  onResizeStart(corner: Corner): void;
  onResize(point: XYPosition, keepAspect: boolean): void;
}

/** One box around a multi-selection, so the members can keep a lighter outline. */
export function SelectionFrame({
  frame,
  resizable,
  onResizeStart,
  onResize,
}: SelectionFrameProps) {
  const flow = useReactFlow();
  const interfaceScale = useCanvasInterfaceScale();
  const zoom = useStore((state) => state.transform[2]) / interfaceScale;
  const grabbed = useRef<Corner | null>(null);
  const started = useRef(false);
  return (
    <ViewportPortal>
      <div
        className={styles.frame}
        style={{
          ...cssVars({ "--frame-line": `${1.5 / zoom}px` }),
          width: frame.width,
          height: frame.height,
          transform: `translate(${frame.x}px, ${frame.y}px)`,
        }}
      >
        {resizable
          ? CORNERS.map((corner) => (
              <button
                key={corner}
                type="button"
                className={styles.corner}
                data-corner={corner}
                aria-label="Resize Selection"
                style={{ scale: `${1 / zoom}` }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  grabbed.current = corner;
                  started.current = false;
                }}
                onPointerMove={(event) => {
                  const corner = grabbed.current;
                  if (!corner) return;
                  if (!started.current) {
                    started.current = true;
                    onResizeStart(corner);
                  }
                  onResize(
                    flow.screenToFlowPosition(
                      { x: event.clientX, y: event.clientY },
                      { snapToGrid: false },
                    ),
                    event.shiftKey,
                  );
                }}
                onPointerUp={() => {
                  grabbed.current = null;
                }}
                onLostPointerCapture={() => {
                  grabbed.current = null;
                }}
              />
            ))
          : null}
      </div>
    </ViewportPortal>
  );
}
