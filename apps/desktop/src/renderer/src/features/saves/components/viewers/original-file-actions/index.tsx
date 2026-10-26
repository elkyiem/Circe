import { IconFileExport, IconWindowShare } from "@pond/icons";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { exportFile, openDefaultApp } from "@/features/saves/lib/actions";
import type { Save } from "@/features/saves/types";
import { isBrowserRuntime } from "@/shared/lib/platform";

interface OriginalFileActionsProps {
  save: Save;
  fileIndex: number;
}

export function OriginalFileActions({
  save,
  fileIndex,
}: OriginalFileActionsProps) {
  const browser = isBrowserRuntime();
  return (
    <>
      {!browser && (
        <ViewerHud.Tool
          label="Open in Default App"
          onClick={() => void openDefaultApp(save, fileIndex)}
        >
          <IconWindowShare />
        </ViewerHud.Tool>
      )}
      <ViewerHud.Tool
        label={browser ? "Download Original" : "Export Original"}
        onClick={() => void exportFile(save, fileIndex)}
      >
        <IconFileExport />
      </ViewerHud.Tool>
    </>
  );
}
