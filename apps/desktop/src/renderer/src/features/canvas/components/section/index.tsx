import { IconPlus } from "@pond/icons";
import { Button, Sidebar } from "@pond/ui";
import { useState } from "react";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import { usePrefs } from "@/shared/state/prefs";
import { createCanvas, sectionItems } from "../../lib/menu";
import {
  useCanvasEditingId,
  useCanvases,
  useHydrateCanvases,
} from "../../state/canvases";
import { CanvasRow } from "../row";

export function CanvasesSection({ activeId }: { activeId: string | null }) {
  useHydrateCanvases();
  const list = useCanvases();
  const editingId = useCanvasEditingId();
  const [open, setOpen] = useState(true);
  const [sidebar] = usePrefs("sidebar");
  useRevealSidebarSection("canvases", editingId !== null);

  if (!sidebar.sections.canvases) return null;

  return (
    <Sidebar.CollapsibleGroup open={open} onOpenChange={setOpen}>
      <SidebarSectionMenu
        section="canvases"
        search
        searchLabel="Search Canvas operations"
        buildItems={sectionItems}
      >
        <Sidebar.GroupHeader>
          <Sidebar.CollapsibleGroupLabel>
            Canvases
          </Sidebar.CollapsibleGroupLabel>
          <Button
            icon
            size="sm"
            variant="ghost"
            aria-label="New Canvas"
            onClick={() => {
              setOpen(true);
              createCanvas();
            }}
          >
            <IconPlus />
          </Button>
        </Sidebar.GroupHeader>
      </SidebarSectionMenu>
      <Sidebar.CollapsibleGroupContent
        aria-label="Canvases"
        inert={!open}
        aria-hidden={!open}
      >
        {list.map((canvas) => (
          <CanvasRow
            key={canvas.id}
            canvas={canvas}
            active={canvas.id === activeId}
            renaming={canvas.id === editingId}
          />
        ))}
      </Sidebar.CollapsibleGroupContent>
    </Sidebar.CollapsibleGroup>
  );
}
