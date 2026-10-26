import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Tray } from "@pond/ui";
import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";

export interface ViewerNavigation {
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}

interface ViewerToolbarGroupsProps {
  controls?: ReactNode;
  actions?: ReactNode;
  edits?: ReactNode;
  view?: ReactNode;
}

export function ViewerToolbarGroups({
  controls,
  actions,
  edits,
  view,
}: ViewerToolbarGroupsProps) {
  const rest = actions || edits || view;
  return (
    <>
      {controls}
      {controls && rest ? (
        <Tray.Separator role="separator" aria-hidden={false} />
      ) : null}
      {actions}
      {edits}
      {view}
    </>
  );
}

export function ViewerNavigationControls({
  navigation,
}: {
  navigation?: ViewerNavigation;
}) {
  const index = navigation?.index ?? 0;
  const count = Math.max(navigation?.count ?? 1, 1);
  const single = count <= 1;

  return (
    <>
      <ViewerHud.Tool
        label="Previous Slide"
        shortcut={<ShortcutKeys id="viewer.prev-slide" />}
        disabled={index <= 0}
        onClick={() => navigation?.onPrevious()}
      >
        <IconArrowLeft />
      </ViewerHud.Tool>
      {single ? null : (
        <ViewerHud.Scale>
          {index + 1} / {count}
        </ViewerHud.Scale>
      )}
      <ViewerHud.Tool
        label="Next Slide"
        shortcut={<ShortcutKeys id="viewer.next-slide" />}
        disabled={index >= count - 1}
        onClick={() => navigation?.onNext()}
      >
        <IconArrowRight />
      </ViewerHud.Tool>
    </>
  );
}
