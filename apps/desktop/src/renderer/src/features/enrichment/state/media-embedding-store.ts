import { Store } from "@tanstack/store";
import { z } from "zod";

interface MediaEmbeddingEntry {
  vec: Float32Array;
  model: string;
}

interface MediaEmbeddingState {
  readonly byId: Map<string, MediaEmbeddingEntry>;
  readonly version: number;
}

const store = new Store<MediaEmbeddingState>({
  byId: new Map(),
  version: 0,
});

export async function setMediaEmbedding(
  id: string,
  vec: Float32Array,
  model: string,
): Promise<void> {
  const saved = await window.pond.query("saves.patchDerived", {
    id,
    patch: { clipEmbedding: Array.from(vec), clipModel: model },
  });
  z.object({ ok: z.literal(true) }).parse(saved);
  store.setState((state) => {
    const byId = new Map(state.byId);
    byId.set(id, { vec, model });
    return { byId, version: state.version + 1 };
  });
}

export function clearMediaEmbeddings(ids?: readonly string[]): number {
  if (ids && ids.length > 0) {
    let count = 0;
    store.setState((state) => {
      const byId = new Map(state.byId);
      for (const id of ids) if (byId.delete(id)) count++;
      return count === 0 ? state : { byId, version: state.version + 1 };
    });
    return count;
  }
  const count = store.state.byId.size;
  if (count === 0) return 0;
  store.setState((state) => ({
    byId: new Map(),
    version: state.version + 1,
  }));
  return count;
}
