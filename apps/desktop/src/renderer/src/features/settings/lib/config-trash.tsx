import { defineSection } from "@/features/settings/lib/engine-types";

export const trashSection = defineSection("trash", {
  title: "Trash",
  description: "How deleted saves are kept and cleared.",
  groups: [
    {
      title: "Trash",
      items: [
        {
          control: "select",
          key: "autoEmptyDays",
          title: "Empty Automatically",
          description: "Deletes them for good after this long.",
          options: [
            { value: null, label: "Never" },
            { value: 7, label: "After 7 days" },
            { value: 14, label: "After 14 days" },
            { value: 30, label: "After 30 days" },
            { value: 90, label: "After 90 days" },
          ],
        },
      ],
    },
  ],
});
