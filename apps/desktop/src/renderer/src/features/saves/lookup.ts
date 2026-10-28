import type { Source } from "@pond/schema/db";
import { pool } from "./state/pool";

export function loadedSaveSource(id: string): Source | undefined {
  return pool.get(id)?.source;
}
