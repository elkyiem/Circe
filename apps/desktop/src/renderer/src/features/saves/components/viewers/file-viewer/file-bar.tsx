import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { OriginalFileActions } from "@/features/saves/components/viewers/original-file-actions";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import {
  type ViewerNavigation,
  ViewerNavigationControls,
  ViewerToolbarGroups,
} from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { FontActivate } from "./font/activate";
import type { ViewerProps } from "./types";

export function FileBar({
  children,
  label = "File viewer",
  ...props
}: ViewerProps & { children?: ReactNode; label?: string }) {
  return (
    <ChromePortal slot="top">
      <ViewerHud.Bar
        label={label}
        start={<ViewerSaveNav saveId={props.save.id} />}
        center={
          <ViewerToolbarGroups
            actions={<FileActions {...props} />}
            view={children}
          />
        }
        end={navigationControls(props.navigation)}
      />
    </ChromePortal>
  );
}

export function navigationControls(navigation?: ViewerNavigation): ReactNode {
  return <ViewerNavigationControls navigation={navigation} />;
}

export function FileActions(props: ViewerProps) {
  return (
    <>
      {props.save.mediaType === "font" ? (
        <FontActivate save={props.save} />
      ) : null}
      <OriginalFileActions save={props.save} fileIndex={props.fileIndex} />
    </>
  );
}
