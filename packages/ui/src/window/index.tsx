import { clsx as cn } from "clsx";
import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Tooltip } from "../tooltip";
import { useWindow, WindowContext, type WindowEdge } from "./context";
import styles from "./styles.module.css";
import { nextTrackWidth } from "./track";

/** A still press held longer than this is an aborted drag, not a click to collapse. */
const CLICK_MAX_MS = 300;

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  leftOpen?: boolean;
  rightOpen?: boolean;
}

function Root({
  className,
  children,
  leftOpen,
  rightOpen,
  ...props
}: RootProps) {
  const [state, setState] = useState<Record<WindowEdge, boolean>>({
    top: false,
    left: false,
    right: false,
    bottom: false,
  });

  const setOpen = useCallback((edge: WindowEdge, open: boolean) => {
    setState((prev) =>
      prev[edge] === open ? prev : { ...prev, [edge]: open },
    );
  }, []);

  const resolvedState = useMemo(
    () => ({
      ...state,
      left: leftOpen ?? state.left,
      right: rightOpen ?? state.right,
    }),
    [state, leftOpen, rightOpen],
  );
  const actions = useMemo(() => ({ setOpen }), [setOpen]);
  const value = useMemo(
    () => ({
      state: resolvedState,
      actions,
      meta: {},
    }),
    [resolvedState, actions],
  );

  return (
    <WindowContext value={value}>
      <div
        className={cn(styles.root, className)}
        data-slot="window"
        data-top-open={resolvedState.top || undefined}
        data-left-open={resolvedState.left || undefined}
        data-right-open={resolvedState.right || undefined}
        data-bottom-open={resolvedState.bottom || undefined}
        {...props}
      >
        {children}
      </div>
    </WindowContext>
  );
}

function useEdgeOpen(edge: WindowEdge, open: boolean) {
  const {
    actions: { setOpen },
  } = useWindow();
  useLayoutEffect(() => {
    setOpen(edge, open);
    return () => {
      setOpen(edge, false);
    };
  }, [setOpen, edge, open]);
}

interface TopProps extends ComponentPropsWithoutRef<"header"> {
  open?: boolean;
}

function Top({ className, open = true, ...props }: TopProps) {
  useEdgeOpen("top", open);
  return (
    <header
      className={cn(styles.top, className)}
      data-slot="top"
      data-open={open || undefined}
      {...props}
    />
  );
}

interface SideProps extends ComponentPropsWithoutRef<"aside"> {
  open?: boolean;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  width?: number;
  resizeLabel?: string;
  collapseShortcut?: ReactNode;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
}

function Left({
  className,
  open = true,
  children,
  minWidth = 180,
  maxWidth = 420,
  defaultWidth,
  width,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...props
}: SideProps) {
  useEdgeOpen("left", open);
  return (
    <aside
      className={cn(styles.left, className)}
      data-slot="left"
      data-open={open || undefined}
      {...props}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      <div className={styles["edge-content"]}>{children}</div>
      {open ? (
        <Handle
          edge="left"
          minWidth={minWidth}
          maxWidth={maxWidth}
          defaultWidth={defaultWidth}
          width={width}
          resizeLabel={resizeLabel}
          collapseShortcut={collapseShortcut}
          onResize={onResize}
          onCollapse={onCollapse}
        />
      ) : null}
    </aside>
  );
}

function Center({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(styles.center, className)}
      data-slot="center"
      tabIndex={-1}
      {...props}
    >
      {children}
    </div>
  );
}

function Right({
  className,
  open = true,
  children,
  minWidth = 280,
  maxWidth = 560,
  defaultWidth,
  width,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...props
}: SideProps) {
  useEdgeOpen("right", open);
  return (
    <aside
      className={cn(styles.right, className)}
      data-slot="right"
      data-open={open || undefined}
      {...props}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      <div className={styles["edge-content"]}>{children}</div>
      {open ? (
        <Handle
          edge="right"
          minWidth={minWidth}
          maxWidth={maxWidth}
          defaultWidth={defaultWidth}
          width={width}
          resizeLabel={resizeLabel}
          collapseShortcut={collapseShortcut}
          onResize={onResize}
          onCollapse={onCollapse}
        />
      ) : null}
    </aside>
  );
}

function followPointer(event: ReactPointerEvent<HTMLHRElement>) {
  const handle = event.currentTarget;
  const y = event.clientY - handle.getBoundingClientRect().top;
  handle
    .closest<HTMLElement>('[data-slot="window"]')
    ?.style.setProperty("--window-handle-y", `${Math.round(y)}px`);
}

function Handle({
  edge,
  minWidth,
  maxWidth,
  defaultWidth,
  width,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
}: {
  edge: "left" | "right";
  minWidth: number;
  maxWidth: number;
  defaultWidth?: number;
  width?: number;
  resizeLabel?: string;
  collapseShortcut?: ReactNode;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
}) {
  const varName =
    edge === "left" ? "--window-left-track" : "--window-right-track";

  const [liveWidth, setLiveWidth] = useState(width ?? defaultWidth ?? minWidth);
  useLayoutEffect(() => {
    setLiveWidth(width ?? defaultWidth ?? minWidth);
  }, [width, defaultWidth, minWidth]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLHRElement>) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    )
      return;
    if (event.key === "Enter" && onCollapse) {
      event.preventDefault();
      event.stopPropagation();
      const center = event.currentTarget
        .closest<HTMLElement>('[data-slot="window"]')
        ?.querySelector<HTMLElement>('[data-slot="center"]');
      onCollapse();
      center?.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    const delta =
      (event.key === "ArrowRight" ? 1 : -1) * (edge === "left" ? 1 : -1) * step;
    const next =
      event.key === "Home"
        ? minWidth
        : event.key === "End"
          ? maxWidth
          : Math.min(maxWidth, Math.max(minWidth, liveWidth + delta));
    const root = event.currentTarget.closest<HTMLElement>(
      '[data-slot="window"]',
    );
    root?.style.setProperty(varName, `${next}px`);
    setLiveWidth(next);
    onResize?.(next);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLHRElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const root = handle.closest("[data-slot=window]");
    const pane = root?.querySelector(`[data-slot="${edge}"]`);
    if (!(pane instanceof HTMLElement) || !(root instanceof HTMLElement)) {
      return;
    }

    const startX = event.clientX;
    const startTime = event.timeStamp;
    const startWidth = pane.getBoundingClientRect().width;
    const previousTrack = root.style.getPropertyValue(varName);
    let nextWidth = startWidth;
    let dragged = false;
    pane.dataset.resizing = "";
    root.dataset.resizing = edge;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    handle.setPointerCapture(event.pointerId);

    const restoreTrack = () => {
      if (previousTrack) root.style.setProperty(varName, previousTrack);
      else root.style.removeProperty(varName);
    };

    const finish = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {}
      delete pane.dataset.resizing;
      delete root.dataset.resizing;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };

    const collapse = (ev: PointerEvent) => {
      finish(ev);
      onCollapse?.();
      restoreTrack();
    };

    const cancel = (ev: PointerEvent) => {
      finish(ev);
      restoreTrack();
      setLiveWidth(startWidth);
    };

    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) dragged = true;
      const next = nextTrackWidth({
        edge,
        startWidth,
        startX,
        clientX: ev.clientX,
        min: minWidth,
        max: maxWidth,
        collapseAtMin: edge === "left" && Boolean(onCollapse),
      });
      if (next === null) {
        if (!dragged) return;
        finish(ev);
        root.style.setProperty(varName, `${minWidth}px`);
        setLiveWidth(minWidth);
        onResize?.(minWidth);
        onCollapse?.();
        return;
      }
      nextWidth = next;
      setLiveWidth(next);
      root.style.setProperty(varName, `${next}px`);
    };

    const up = (ev: PointerEvent) => {
      if (!dragged) {
        if (ev.timeStamp - startTime < CLICK_MAX_MS) collapse(ev);
        else cancel(ev);
        return;
      }
      finish(ev);
      onResize?.(nextWidth);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  };

  return (
    <Tooltip
      label={Tooltip.Label("Click to collapse", collapseShortcut)}
      side={edge === "left" ? "right" : "left"}
      delay={400}
      trackCursorAxis="y"
    >
      <hr
        className={styles.handle}
        data-slot="handle"
        data-edge={edge}
        aria-orientation="vertical"
        aria-label={
          resizeLabel ?? (edge === "left" ? "Resize sidebar" : "Resize panel")
        }
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={liveWidth}
        aria-valuetext={`${Math.round(liveWidth)} pixels`}
        aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={followPointer}
      />
    </Tooltip>
  );
}

interface BottomProps extends ComponentPropsWithoutRef<"footer"> {
  open?: boolean;
}

function Bottom({ className, open = true, ...props }: BottomProps) {
  useEdgeOpen("bottom", open);
  return (
    <footer
      className={cn(styles.bottom, className)}
      data-slot="bottom"
      data-open={open || undefined}
      {...props}
    />
  );
}

export const Window = { Root, Top, Left, Center, Right, Bottom };
export {
  useWindow,
  type WindowContextValue,
  type WindowEdge,
} from "./context";
