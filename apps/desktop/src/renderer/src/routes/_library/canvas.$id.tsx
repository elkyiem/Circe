import { createFileRoute } from "@tanstack/react-router";
import { exportBrowserCanvas } from "@/browser/canvas-export";
import { CanvasPage } from "@/features/canvas/components/page";
import { isBrowserRuntime } from "@/shared/lib/platform";

export const Route = createFileRoute("/_library/canvas/$id")({
  component: CanvasRoute,
});

function CanvasRoute() {
  const { id } = Route.useParams();
  return (
    <CanvasPage
      id={id}
      onExport={isBrowserRuntime() ? exportBrowserCanvas : undefined}
    />
  );
}
