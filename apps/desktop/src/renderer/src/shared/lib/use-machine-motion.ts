import { useEffect, useSyncExternalStore } from "react";
import {
  machineMotionPaused,
  retainMachinePace,
  subscribeMachinePace,
} from "./machine-pace";

export function useMachineMotionPaused(): boolean {
  useEffect(() => retainMachinePace(), []);
  return useSyncExternalStore(
    subscribeMachinePace,
    machineMotionPaused,
    () => false,
  );
}
