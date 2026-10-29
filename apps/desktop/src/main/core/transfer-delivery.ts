import type { OkResult } from "../../shared/query-contracts-shared";
import type { TransferJob } from "../../shared/transfer-contracts";

/** The resident file owner serves both desktop and browser transfer history. */
export interface TransferDelivery {
  list(): Promise<TransferJob[]>;
  retry(id: string): Promise<OkResult>;
  artifact(id: string): Promise<{ path: string; filename: string }>;
}
let delivery: TransferDelivery | null = null;
export function registerTransferDelivery(owner: TransferDelivery) {
  if (delivery)
    throw new Error("The transfer delivery owner is already running.");
  delivery = owner;
  return () => {
    if (delivery === owner) delivery = null;
  };
}
export function transferDelivery() {
  return delivery;
}
