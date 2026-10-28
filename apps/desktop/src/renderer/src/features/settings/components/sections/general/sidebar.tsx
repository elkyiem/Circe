import { Button, Settings } from "@pond/ui";
import { useState } from "react";
import { SidebarCustomizationDialog } from "@/features/settings/components/sidebar-customization-dialog";
import { EnumSelect } from "@/shared/components/enum-select";
import { usePrefs } from "@/shared/state/prefs";

export function SidebarPreferences() {
  const [sidebar, patch, loaded] = usePrefs("sidebar");
  const [customizing, setCustomizing] = useState(false);

  return (
    <>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>App Sidebar</Settings.ItemTitle>
            <Settings.ItemDescription>
              Which items appear, and whether they show counts.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="secondary"
              disabled={!loaded}
              onClick={() => setCustomizing(true)}
            >
              Customize
            </Button>
          </Settings.ItemControl>
        </Settings.Item>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Folder Double-Click</Settings.ItemTitle>
            <Settings.ItemDescription>
              Open the folder, or expand and collapse it.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <EnumSelect<"open" | "expand-collapse">
              value={sidebar.doubleClickBehavior}
              disabled={!loaded}
              options={[
                { value: "open", label: "Open Folder" },
                { value: "expand-collapse", label: "Expand or Collapse" },
              ]}
              onValueChange={(doubleClickBehavior) =>
                void patch({ doubleClickBehavior })
              }
            />
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
      <SidebarCustomizationDialog
        open={customizing}
        onOpenChange={setCustomizing}
      />
    </>
  );
}
