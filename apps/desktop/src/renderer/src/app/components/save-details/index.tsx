import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import { usePrefs } from "@/shared/state/prefs";

const SaveInspector = lazy(async () => {
  const module = await import("@/features/saves/components/detail/pane");
  return { default: module.SaveInspector };
});

/** Keeps the last Save mounted so the column can animate closed after leaving the viewer. */
export function SaveDetails() {
  const openId = useRouterState({
    select: (s) => saveIdFromPath(s.location.pathname),
  });
  const [saveId, setSaveId] = useState(openId);
  if (openId && openId !== saveId) setSaveId(openId);
  const memberships = useFolderMemberships();
  const folders = useFolders();
  const [folderViews] = usePrefs("folderViews");
  if (!saveId) return null;
  const assigned = memberships[saveId] ?? [];
  return (
    <Suspense fallback={null}>
      <SaveInspector
        saveId={saveId}
        folders={folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          icon: folderViews[folder.id]?.icon,
          color: folder.color,
          count: assigned.includes(folder.id) ? 1 : 0,
        }))}
      />
    </Suspense>
  );
}
