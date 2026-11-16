import type { SectionConfig } from "@/features/settings/components/engine";
import { BrowserConnections } from "@/features/settings/components/sections/browser-connections";
import { LibrarySettings } from "@/features/settings/components/sections/library";
import { inboxGroup } from "@/features/settings/lib/config-inbox";
import { trashSection } from "@/features/settings/lib/config-trash";

export const librarySection: SectionConfig = {
  title: "Library",
  description: "Manage the open library.",
  keywords: [
    "library",
    "identity",
    "name",
    "logo",
    "icon",
    "browsers",
    "devices",
    "pairing",
    "inbox",
  ],
  groups: [
    {
      title: "Library",
      fullWidth: true,
      render: () => <LibrarySettings />,
    },
    inboxGroup,
    {
      title: "Devices",
      fullWidth: true,
      render: () => <BrowserConnections />,
    },
    ...(trashSection.groups ?? []).map((group) => ({
      ...group,
      prefsKey: "trash" as const,
    })),
  ],
};
