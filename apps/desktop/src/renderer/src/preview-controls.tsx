import {
  IconArrowLeft,
  IconArrowRight,
  IconContrast,
  IconExpand,
  IconFileExport,
  IconFlipHorizontal2,
  IconFullScreen,
  IconMediaPause,
  IconMediaPlay,
  IconPinTack,
  IconRotateImageClockwise,
  IconSizeLg,
  IconWindowShare,
} from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import type { ReactElement } from "react";
import type { PreviewWindowState } from "../../shared/preview-window-contracts";
import { FramelessWindowChrome } from "./shared/components/frameless-window-chrome";

export interface PreviewControlActions {
  close(): void;
  cycleOpacity(): void;
  next(): void;
  openOriginal(): void;
  previous(): void;
  toggleFullscreen(): void;
  toggleGrayscale(): void;
  toggleMirror(): void;
  togglePin(): void;
  toggleSize(): void;
  toggleSlideshow(): void;
  rotate(): void;
  exportOriginal(): void;
}

interface PreviewToolProps {
  children: ReactElement;
  label: string;
  onClick(): void;
  pressed?: boolean;
  side: "top" | "bottom";
}

function PreviewTool({
  children,
  label,
  onClick,
  pressed,
  side,
}: PreviewToolProps) {
  return (
    <Tooltip label={label} side={side}>
      <Button
        aria-label={label}
        aria-pressed={pressed}
        icon
        onClick={onClick}
        size="sm"
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function MediaTools({
  state,
  actions,
  side,
}: {
  state: PreviewWindowState;
  actions: PreviewControlActions;
  side: "top" | "bottom";
}) {
  return state.mediaType === "image" ? (
    <div className="preview-control-group">
      <PreviewTool label={"Rotate"} onClick={actions.rotate} side={side}>
        <IconRotateImageClockwise />
      </PreviewTool>
      <PreviewTool
        label={"Mirror"}
        onClick={actions.toggleMirror}
        pressed={state.mirrored}
        side={side}
      >
        <IconFlipHorizontal2 />
      </PreviewTool>
      <PreviewTool
        label={"Grayscale"}
        onClick={actions.toggleGrayscale}
        pressed={state.grayscale}
        side={side}
      >
        <IconContrast />
      </PreviewTool>
      <PreviewTool
        label={state.zoom === null ? "Actual Size" : "Fit"}
        onClick={actions.toggleSize}
        pressed={state.zoom !== null}
        side={side}
      >
        {state.zoom === null ? <IconSizeLg /> : <IconExpand />}
      </PreviewTool>
    </div>
  ) : (
    <div className="preview-control-group">
      <PreviewTool
        label={state.size === "fill" ? "Fit" : "Fill"}
        onClick={actions.toggleSize}
        pressed={state.size === "fill"}
        side={side}
      >
        <IconExpand />
      </PreviewTool>
    </div>
  );
}

export function PreviewControls({
  actions,
  slideshow,
  state,
  nativeWindow = true,
}: {
  actions: PreviewControlActions;
  slideshow: boolean;
  state: PreviewWindowState;
  nativeWindow?: boolean;
}) {
  const tooltipSide = state.mediaType === "video" ? "bottom" : "top";

  return (
    <Tooltip.Provider>
      <div className="preview-window-chrome">
        <FramelessWindowChrome
          closeLabel={"Close Preview"}
          onClose={actions.close}
        />
      </div>
      <Tooltip.Group>
        <nav aria-label={"Preview Controls"} className="preview-controls">
          <div className="preview-control-group">
            <PreviewTool
              label={"Previous"}
              onClick={actions.previous}
              side={tooltipSide}
            >
              <IconArrowLeft />
            </PreviewTool>
            <PreviewTool
              label={"Next"}
              onClick={actions.next}
              side={tooltipSide}
            >
              <IconArrowRight />
            </PreviewTool>
            {state.kind === "presentation" ? (
              <PreviewTool
                label={slideshow ? "Pause Slideshow" : "Play Slideshow"}
                onClick={actions.toggleSlideshow}
                pressed={slideshow}
                side={tooltipSide}
              >
                {slideshow ? <IconMediaPause /> : <IconMediaPlay />}
              </PreviewTool>
            ) : null}
          </div>

          <MediaTools state={state} actions={actions} side={tooltipSide} />

          <div className="preview-control-group">
            {nativeWindow ? (
              <PreviewTool
                label={"Open in Default App"}
                onClick={actions.openOriginal}
                side={tooltipSide}
              >
                <IconWindowShare />
              </PreviewTool>
            ) : null}
            <PreviewTool
              label={nativeWindow ? "Export Original" : "Download Original"}
              onClick={actions.exportOriginal}
              side={tooltipSide}
            >
              <IconFileExport />
            </PreviewTool>
          </div>

          <div className="preview-control-group">
            <PreviewTool
              label={"Fullscreen"}
              onClick={actions.toggleFullscreen}
              pressed={state.fullscreen}
              side={tooltipSide}
            >
              <IconFullScreen />
            </PreviewTool>
            {nativeWindow ? (
              <>
                <Tooltip
                  label={`${"Opacity"}: ${Math.round(state.opacity * 100)}%`}
                  side={tooltipSide}
                >
                  <Button
                    aria-label={`${"Opacity"}: ${Math.round(state.opacity * 100)}%`}
                    className="preview-opacity"
                    onClick={actions.cycleOpacity}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {Math.round(state.opacity * 100)}%
                  </Button>
                </Tooltip>
                <PreviewTool
                  label={"Keep on Top"}
                  onClick={actions.togglePin}
                  pressed={state.alwaysOnTop}
                  side={tooltipSide}
                >
                  <IconPinTack />
                </PreviewTool>
              </>
            ) : null}
          </div>
        </nav>
      </Tooltip.Group>
    </Tooltip.Provider>
  );
}
