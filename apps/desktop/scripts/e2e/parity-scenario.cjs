/** Queries the upstream parity suite asserts on both transports; the E2E inventory counts them. */
exports.parityScenario = {
  id: "parity.carousel-media-and-sources",
  queries: [
    "arenaLinks.status",
    "saves.get",
    "saves.patchDerived",
    "saves.setImageThumbnail",
    "saves.split",
    "saves.splitAllStatus",
    "saves.splittableCount",
  ],
};
