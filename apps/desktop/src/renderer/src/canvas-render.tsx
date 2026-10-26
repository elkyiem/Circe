import { Dialog, Tooltip } from "@pond/ui";
import { ReactFlowProvider } from "@xyflow/react";
import { createRoot } from "react-dom/client";
import type { PondCanvasRenderApi } from "../../preload/canvas-render";
import { Board } from "./features/canvas/components/board";
import { ThemeApplier } from "./features/settings/effects/theme-applier";
import "./styles.css";

declare global {
  interface Window {
    pondCanvasRender?: PondCanvasRenderApi;
  }
}
const api = window.pondCanvasRender;
if (!api) throw new Error("Canvas renderer bridge missing.");
const root = document.getElementById("root");
if (!root) throw new Error("Canvas renderer root missing.");
Object.assign(document.documentElement.style, { height: "100%" });
Object.assign(document.body.style, {
  height: "100%",
  margin: "0",
  overflow: "hidden",
});
Object.assign(root.style, { height: "100%", display: "flex" });
void api
  .ready()
  .then((input) => {
    createRoot(root).render(
      <Tooltip.Provider>
        <Dialog.PortalProvider>
          <ThemeApplier />
          <ReactFlowProvider>
            <Board
              canvas={input.canvas}
              snapshot={{
                complete: (image) => {
                  void api.finish({
                    image: { ...image, png: Uint8Array.from(image.png) },
                  });
                },
                fail: (error) => {
                  void api.finish({ error });
                },
              }}
            />
          </ReactFlowProvider>
        </Dialog.PortalProvider>
      </Tooltip.Provider>,
    );
  })
  .catch(() => {
    void api.finish({ error: "Could not initialize the Canvas renderer." });
  });
