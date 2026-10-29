import type { ImageCrop } from "@pond/schema/db";
import type {
  Dispatch,
  PointerEventHandler,
  RefObject,
  SetStateAction,
} from "react";
import {
  type CropHandle,
  clampImagePoint,
  cropContains,
  inImage,
  isFullImageCrop,
  lockCropAspect,
  nudgeCrop,
  resizeCrop,
  snapCrop,
  snapImagePoint,
} from "@/features/saves/lib/image-regions";
import {
  type ImagePose,
  zoomImageAt,
} from "@/features/saves/lib/viewer-memory";
import { cropHandleFromTarget } from "./crop-handles";
import type { InspectorMode } from "./types";

export interface ImageDrag {
  pointerId: number;
  scale: number;
  button: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  cropX: number;
  cropY: number;
  crop?: ImageCrop;
  handle?: CropHandle;
}

interface ImageGestureOptions {
  active: boolean;
  draft: ImageCrop | null;
  drag: RefObject<ImageDrag | null>;
  gestureMoved: RefObject<boolean>;
  mode: InspectorMode;
  onNavigate: (delta: number) => void;
  pointFromClient: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number };
  poseZoom: number;
  panAtFit: boolean;
  onPanChange: (panning: boolean) => void;
  ratio: number | null;
  setDraft: Dispatch<SetStateAction<ImageCrop | null>>;
  setPosition: (
    update: (previous: ImagePose) => ImagePose,
    live?: boolean,
  ) => void;
}

interface ImageGestures {
  onAuxClick: PointerEventHandler<HTMLDivElement>;
  onContextMenu: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>;
}

export function createImageGestures({
  active,
  draft,
  drag,
  gestureMoved,
  mode,
  onNavigate,
  pointFromClient,
  poseZoom,
  panAtFit,
  onPanChange,
  ratio,
  setDraft,
  setPosition,
}: ImageGestureOptions): ImageGestures {
  const cancel: PointerEventHandler<HTMLDivElement> = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    onPanChange(false);
  };
  return {
    onAuxClick: (event) => {
      if (event.button === 1) event.preventDefault();
    },
    onContextMenu: (event) => {
      if (gestureMoved.current) event.preventDefault();
    },
    onPointerDown: (event) => {
      if (!active) return;
      if (drag.current) return;
      const handle = cropHandleFromTarget(event.target);
      if (
        event.target instanceof Element &&
        event.target.closest("button") &&
        !handle
      )
        return;
      if (mode !== "view" && event.button !== 0) return;
      if (![0, 1, 2].includes(event.button)) return;
      if (event.button === 0 && mode === "view" && poseZoom <= 1 && !panAtFit)
        return;
      const raw = pointFromClient(event.clientX, event.clientY);
      const point = snapImagePoint(clampImagePoint(raw));
      const moving =
        mode === "crop" &&
        inImage(raw) &&
        !handle &&
        !!draft &&
        !isFullImageCrop(draft) &&
        cropContains(draft, point);
      event.preventDefault();
      event.stopPropagation();
      gestureMoved.current = false;
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      onPanChange(mode === "view" && event.button !== 2);
      const frame = event.currentTarget;
      const scale =
        frame.clientWidth > 0
          ? frame.getBoundingClientRect().width / frame.clientWidth
          : 1;
      drag.current = {
        pointerId: event.pointerId,
        scale: scale > 0 ? scale : 1,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        cropX: point.x,
        cropY: point.y,
        crop: handle || moving ? (draft ?? undefined) : undefined,
        handle: handle ?? undefined,
      };
    },
    onPointerMove: (event) => {
      const origin = drag.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const dx = (event.clientX - origin.x) / origin.scale;
      const dy = (event.clientY - origin.y) / origin.scale;
      if (origin.button === 2) {
        if (
          Math.abs(event.clientX - origin.startX) +
            Math.abs(event.clientY - origin.startY) >
          4
        )
          gestureMoved.current = true;
        if (
          Math.abs(event.clientY - origin.startY) >
          Math.abs(event.clientX - origin.startX)
        )
          setPosition(
            (previous) =>
              zoomImageAt(previous, previous.zoom * Math.exp(-dy * 0.01), {
                x: 0,
                y: 0,
              }),
            true,
          );
      } else if (mode !== "view") {
        const point = snapImagePoint(
          clampImagePoint(pointFromClient(event.clientX, event.clientY)),
        );
        if (origin.handle && origin.crop) {
          const next = resizeCrop(origin.crop, origin.handle, point);
          setDraft(
            event.shiftKey && ratio ? lockCropAspect(next, ratio) : next,
          );
        } else if (origin.crop) {
          setDraft(
            snapCrop(
              nudgeCrop(
                origin.crop,
                point.x - origin.cropX,
                point.y - origin.cropY,
              ),
            ),
          );
        } else {
          const next = {
            x: Math.min(point.x, origin.cropX),
            y: Math.min(point.y, origin.cropY),
            w: Math.abs(point.x - origin.cropX),
            h: Math.abs(point.y - origin.cropY),
          };
          setDraft(
            event.shiftKey && ratio ? lockCropAspect(next, ratio) : next,
          );
        }
      } else
        setPosition(
          (previous) => ({
            ...previous,
            x: previous.x + dx,
            y: previous.y + dy,
          }),
          true,
        );
      origin.x = event.clientX;
      origin.y = event.clientY;
    },
    onPointerUp: (event) => {
      const origin = drag.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      if (
        origin?.button === 2 &&
        Math.abs(event.clientX - origin.startX) > 80 &&
        Math.abs(event.clientX - origin.startX) >
          Math.abs(event.clientY - origin.startY)
      )
        onNavigate(event.clientX > origin.startX ? -1 : 1);
      drag.current = null;
      onPanChange(false);
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  };
}
