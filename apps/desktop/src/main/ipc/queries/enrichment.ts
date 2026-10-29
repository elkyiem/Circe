import { z } from "zod";
import {
  EnrichmentTaskSchema,
  HostInferenceSchema,
} from "../../../shared/enrichment-contracts";
import { query } from "./params";

export const enrichmentQueries = {
  "enrichment.status": query(z.object({}), async () =>
    (await import("../../core/enrichment-owner")).enrichmentOwner.status(),
  ),
  "enrichment.run": query(EnrichmentTaskSchema, async (task) =>
    (await import("../../core/enrichment-owner")).enrichmentOwner.run(task),
  ),
  "enrichment.infer": query(HostInferenceSchema, async (input) =>
    (await import("../../core/enrichment-owner")).enrichmentOwner.infer(input),
  ),
};
