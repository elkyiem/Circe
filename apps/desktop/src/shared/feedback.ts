export const FEEDBACK_EVENTS = [
  "saveDeletion",
  "folderDeletion",
  "extensionCapture",
  "autoImport",
] as const;

export type FeedbackEvent = (typeof FEEDBACK_EVENTS)[number];

export const FEEDBACK_MESSAGES = {
  saveDeletion: { title: "Save Removed" },
  folderDeletion: { title: "Folder Removed" },
  extensionCapture: { title: "Saved to Pond" },
  autoImport: { title: "Imported to Pond" },
} as const satisfies Record<FeedbackEvent, { title: string }>;
