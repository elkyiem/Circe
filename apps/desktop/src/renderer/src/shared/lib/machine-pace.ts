import {
  type MachinePace,
  MachinePaceWireSchema,
  motionPaused,
  THERMAL_RELIEF_MS,
  type ThermalState,
} from "@shared/machine-pace";

const idle = (): MachinePace => ({
  hidden: false,
  focused: true,
  onBattery: false,
  thermal: "unknown",
  reliefAt: null,
});

let pace = idle();
let motionHold = false;
let users = 0;
let stopListening = (): void => {};
let reliefTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function readMachinePace(): MachinePace {
  return pace;
}

export function machineMotionPaused(): boolean {
  return motionHold;
}

export function subscribeMachinePace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: MachinePace): void {
  pace = next;
  if (reliefTimer) {
    clearTimeout(reliefTimer);
    reliefTimer = null;
  }
  if (pace.reliefAt != null) {
    const delay = THERMAL_RELIEF_MS - (Date.now() - pace.reliefAt);
    if (delay > 0) {
      reliefTimer = setTimeout(() => {
        reliefTimer = null;
        publish({ ...pace, reliefAt: null });
      }, delay);
    } else {
      pace = { ...pace, reliefAt: null };
    }
  }
  motionHold = motionPaused(pace, Date.now());
  if ("document" in globalThis) {
    const root = document.documentElement;
    if (motionHold) root.setAttribute("data-motion-paused", "true");
    else root.removeAttribute("data-motion-paused");
  }
  for (const listener of listeners) listener();
}

function patch(partial: Partial<MachinePace>): void {
  publish({ ...pace, ...partial });
}

function readFocus() {
  if (!("document" in globalThis)) return { hidden: false, focused: true };
  return { hidden: document.hidden, focused: document.hasFocus() };
}

function bindHost(
  onHost: (host: { thermal: ThermalState; onBattery: boolean }) => void,
): () => void {
  if (!("window" in globalThis) || !("pond" in window)) return () => {};
  const { machinePace, onMachinePace } = window.pond;
  if (!machinePace || !onMachinePace) return () => {};
  let cancelled = false;
  void machinePace()
    .then((wire) => {
      if (cancelled) return;
      const parsed = MachinePaceWireSchema.safeParse(wire);
      if (parsed.success) onHost(parsed.data);
    })
    .catch(() => {});
  const detach = onMachinePace((wire) => {
    const parsed = MachinePaceWireSchema.safeParse(wire);
    if (parsed.success) onHost(parsed.data);
  });
  return () => {
    cancelled = true;
    detach();
  };
}

function listen(): () => void {
  publish({ ...pace, ...readFocus() });
  const onVisibility = (): void => patch(readFocus());
  const onFocus = (): void => patch({ focused: true });
  const onBlur = (): void => patch({ focused: false });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  const stopHost = bindHost((host) => {
    const wasHot = pace.thermal === "serious" || pace.thermal === "critical";
    const nowHot = host.thermal === "serious" || host.thermal === "critical";
    let reliefAt = pace.reliefAt;
    if (nowHot) reliefAt = null;
    else if (wasHot) reliefAt = Date.now();
    patch({
      onBattery: host.onBattery,
      thermal: host.thermal,
      reliefAt,
    });
  });
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    stopHost();
  };
}

export function retainMachinePace(): () => void {
  users += 1;
  if (users === 1) stopListening = listen();
  return () => {
    users -= 1;
    if (users > 0) return;
    stopListening();
    stopListening = () => {};
    if (reliefTimer) clearTimeout(reliefTimer);
    reliefTimer = null;
    pace = idle();
    motionHold = false;
    if ("document" in globalThis) {
      document.documentElement.removeAttribute("data-motion-paused");
    }
  };
}
