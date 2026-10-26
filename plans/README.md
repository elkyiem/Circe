# Iris implementation plans

Generated on 2026-10-26 against commit `2629bfb5`. These are proposed plans;
no application implementation is included in this planning change.

| Plan | Priority | Effort | Dependency | Status |
| --- | --- | --- | --- | --- |
| [001: Complete browser parity](001-complete-browser-parity.md) | P1 | XL, phased | Existing host-backed milestone | TODO |

Execution order: inventory and verification → Library editing → capture and
transfers → Source/Downloads parity; viewers and Canvas can proceed after capture
and transfers; Agent/enrichment follow the relevant mutation/media adapters;
Library administration follows the completed boundary. Mobile and private remote
checks expand throughout, followed by the full release gate.

Maintain desktop parity and the clean upstream mirror. Promote only verified
slices into dev. Electron removal is a separate future runtime project.

Considered and excluded: renderer redesign, database/job-system replacement,
blanket remote exposure of the desktop query registry, collector replacement,
and treating an unsupported-action message as completed feature parity.
