import { powerMonitor } from "electron";
import { IPC } from "../../shared/constants";
import {
  type MachinePaceWire,
  MachinePaceWireSchema,
} from "../../shared/machine-pace";
import { safeHandle } from "../ipc/helpers";
import { broadcast } from "../lib/broadcast";

function readPace(): MachinePaceWire {
  const parsed = MachinePaceWireSchema.safeParse({
    thermal:
      process.platform === "darwin"
        ? powerMonitor.getCurrentThermalState()
        : "unknown",
    onBattery: powerMonitor.isOnBatteryPower(),
  });
  return parsed.success
    ? parsed.data
    : { thermal: "unknown", onBattery: false };
}

/** macOS thermal state is main-process only. The renderer uses it to stop inference and decorative motion. */
export function startMachinePace(): void {
  safeHandle(IPC.machinePace, () => readPace());
  const publish = (): void => broadcast(IPC.machinePaceChanged, readPace());
  powerMonitor.on("on-battery", publish);
  powerMonitor.on("on-ac", publish);
  if (process.platform === "darwin") {
    powerMonitor.on("thermal-state-change", publish);
  }
}
