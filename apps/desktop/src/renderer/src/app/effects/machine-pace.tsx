import { useEffect } from "react";
import { retainMachinePace } from "@/shared/lib/machine-pace";

export function MachinePace() {
  useEffect(() => retainMachinePace(), []);
  return null;
}
