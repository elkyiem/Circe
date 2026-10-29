import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Identity is host-owned; every window observes commits without replacing drafts. */
export function LibraryIdentityBridge() {
  const client = useQueryClient();
  useEffect(
    () =>
      window.pond.onLibraryIdentityChanged((libraryId) => {
        if (libraryId !== window.pond.libraryId()) return;
        void client.invalidateQueries({ queryKey: ["library-info"] });
        void client.invalidateQueries({ queryKey: ["recent-libraries"] });
      }),
    [client],
  );
  return null;
}
