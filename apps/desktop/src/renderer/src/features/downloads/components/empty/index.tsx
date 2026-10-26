import { IconCircleCheckFill, IconWindowDownloadFill } from "@pond/icons";
import { Button, Empty } from "@pond/ui";
import { getAppRouter } from "@/shared/lib/app-router";

export function DownloadsEmpty() {
  return (
    <Empty.Root>
      <Empty.Media>
        <IconWindowDownloadFill size={32} />
      </Empty.Media>
      <Empty.Title>No downloads yet</Empty.Title>
      <Empty.Description>
        Files appear here while Pond downloads them for your library.
      </Empty.Description>
      <Empty.Action>
        <Button
          variant="primary"
          size="sm"
          onClick={() => getAppRouter()?.history.push("/")}
        >
          Open Library
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}

export function DownloadsCompletedHidden({
  onShowCompleted,
}: {
  onShowCompleted: () => void;
}) {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconCircleCheckFill size={32} />
      </Empty.Media>
      <Empty.Title>No unfinished downloads</Empty.Title>
      <Empty.Description>
        Completed downloads are hidden by the Status filter.
      </Empty.Description>
      <Empty.Action>
        <Button variant="primary" size="sm" onClick={onShowCompleted}>
          Show Completed
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}
