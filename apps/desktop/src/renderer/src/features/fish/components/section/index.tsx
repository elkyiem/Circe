import { IconPlus } from "@pond/icons";
import { Button, Sidebar } from "@pond/ui";
import { useState } from "react";
import { SidebarSectionMenu } from "@/features/settings";
import { usePrefs } from "@/shared/state/prefs";
import { createFish, sectionItems } from "../../lib/menu";
import { useFishList, useHydrateFish } from "../../state/fish";
import { FishRow } from "../row";

export function FishSection({ activeId }: { activeId: string | null }) {
  useHydrateFish();
  const school = useFishList();
  const [open, setOpen] = useState(true);
  const [sidebar] = usePrefs("sidebar");

  if (!sidebar.sections.fish) return null;

  return (
    <Sidebar.CollapsibleGroup open={open} onOpenChange={setOpen}>
      <SidebarSectionMenu
        section="fish"
        search
        searchLabel="Search Fish operations"
        buildItems={sectionItems}
      >
        <Sidebar.GroupHeader>
          <Sidebar.CollapsibleGroupLabel>Fish</Sidebar.CollapsibleGroupLabel>
          <Button
            icon
            size="sm"
            variant="ghost"
            aria-label="New Fish"
            onClick={() => {
              setOpen(true);
              createFish();
            }}
          >
            <IconPlus />
          </Button>
        </Sidebar.GroupHeader>
      </SidebarSectionMenu>
      <Sidebar.CollapsibleGroupContent
        aria-label="Fish"
        inert={!open}
        aria-hidden={!open}
      >
        {school.map((fish) => (
          <FishRow key={fish.id} fish={fish} active={fish.id === activeId} />
        ))}
      </Sidebar.CollapsibleGroupContent>
    </Sidebar.CollapsibleGroup>
  );
}
