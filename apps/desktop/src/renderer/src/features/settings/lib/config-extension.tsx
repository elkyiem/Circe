import { ExtensionSources } from "@/features/settings/components/sections/extension";
import { defineSection } from "@/features/settings/lib/engine-types";

export const extensionSection = defineSection("extension", {
  title: "Browser Extension",
  description:
    "Every browser with the Pond extension picks these up the next time you open it or save.",
  keywords: ["chrome", "firefox", "arc", "browser", "capture", "screenshot"],
  groups: [
    {
      title: "General",
      items: [
        {
          control: "select",
          key: "toolbar",
          title: "Toolbar Button",
          description: "Save Page stores the page without the panel.",
          options: [
            { value: "popup", label: "Open Panel" },
            { value: "save", label: "Save Page" },
          ],
        },
        {
          control: "select",
          key: "theme",
          title: "Theme",
          description: "Match Library follows the open library.",
          options: [
            { value: "library", label: "Match Library" },
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ],
        },
        {
          control: "switch",
          key: "confirmations",
          title: "Show Confirmations",
          description: "When off, a badge replaces the page notice.",
        },
      ],
    },
    {
      title: "Saving",
      items: [
        {
          control: "switch",
          key: "askDetails",
          title: "Ask Where to Save",
          description: "Asks for a name, rating, tags, and folders.",
          keywords: ["details", "rating", "folders", "tags"],
        },
        {
          control: "switch",
          key: "altClick",
          title: "Alt-Right-Click to Save",
          description: "Right-click an image or link while holding Alt.",
          tooltip: "On a Mac, hold Option.",
          keywords: ["option", "gesture", "right click"],
        },
      ],
    },
    {
      title: "Screenshots",
      items: [
        {
          control: "select",
          key: "screenshotFormat",
          title: "Screenshot Format",
          description: "PNG keeps text sharp, and JPEG is smaller.",
          options: [
            { value: "png", label: "PNG" },
            { value: "jpeg", label: "JPEG" },
          ],
        },
        {
          control: "switch",
          key: "retina",
          title: "Full Resolution",
          description: "Saves every pixel on a high-density display.",
          tooltip: "The page can look smaller than the saved image.",
          keywords: ["retina", "2x", "density"],
        },
      ],
    },
    {
      title: "Sources",
      render: () => <ExtensionSources />,
    },
  ],
});
