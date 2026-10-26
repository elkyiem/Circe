import type { AssistantChange } from "@shared/assistant";

export interface SampleSave {
  id: string;
  title: string;
}

const PLACEHOLDERS: SampleSave[] = Array.from({ length: 6 }, (_, index) => ({
  id: `gallery-save-${index + 1}`,
  title: `Sample Save ${index + 1}`,
}));

type Status = AssistantChange["status"];

function tags(
  save: SampleSave,
  status: Status,
  added: string,
  extra: Partial<AssistantChange> = {},
): AssistantChange {
  /** SAFETY: `field` is "tags" with string-array before/after, and `extra` only overrides shared fields. */
  return {
    id: `${save.id}:tags:${status}:${added}`,
    saveId: save.id,
    title: save.title,
    reason: "",
    status,
    field: "tags",
    before: ["Design"],
    after: ["Design", added],
    undoable: true,
    ...extra,
  } as AssistantChange;
}

function rename(save: SampleSave, status: Status): AssistantChange {
  return {
    id: `${save.id}:title:${status}`,
    saveId: save.id,
    title: save.title,
    reason: "",
    status,
    field: "title",
    before: save.title,
    after: "Status icons in motion",
    undoable: true,
  };
}

export function reviewFixtures(input: readonly SampleSave[]) {
  const saves = [...input, ...PLACEHOLDERS];
  /** SAFETY: PLACEHOLDERS holds six saves, so the first six entries always exist. */
  const [a, b, c, d, e, f] = saves as [
    SampleSave,
    SampleSave,
    SampleSave,
    SampleSave,
    SampleSave,
    SampleSave,
  ];
  return {
    single: [tags(a, "pending", "Interface")],
    several: [
      tags(a, "pending", "Interface"),
      tags(b, "pending", "Motion"),
      rename(c, "pending"),
    ],
    failed: [
      tags(a, "pending", "Interface", {
        error: "Couldn't update this Save. Try again.",
      }),
      tags(b, "pending", "Motion"),
    ],
    mixed: [
      tags(a, "pending", "Interface"),
      tags(b, "applied", "Motion"),
      tags(c, "dismissed", "Retail"),
    ],
    operation: [
      {
        id: "gallery-operation",
        saveId: "",
        title: "Library",
        reason: "",
        status: "pending",
        field: "action",
        action: "runOperation",
        before: null,
        after: "Create folder Design Systems",
        undoable: false,
      } satisfies AssistantChange,
    ],
    applied: [
      tags(d, "applied", "Interface"),
      tags(e, "applied", "Motion"),
      tags(f, "applied", "Retail"),
    ],
    decided: [
      tags(d, "applied", "Interface"),
      tags(e, "applied", "Motion"),
      tags(f, "dismissed", "Retail"),
    ],
    dismissed: [
      tags(d, "dismissed", "Interface"),
      tags(e, "dismissed", "Motion"),
    ],
    undone: [tags(d, "undone", "Interface"), tags(e, "applied", "Motion")],
    purge: [
      {
        id: "gallery-purge",
        saveId: "",
        title: "Trash",
        reason: "",
        status: "pending",
        field: "action",
        action: "purgeTrash",
        before: null,
        after: "Empty Trash",
        undoable: false,
      } satisfies AssistantChange,
    ],
  };
}

export const QUESTION = {
  question: "How should I organize your Design folder?",
  options: ["By type", "By project", "By date"],
};

export const LONG_OPTIONS = [
  "One folder per client, with a Moodboard subfolder for loose references",
  "One folder per month",
  "Leave it, I'll sort it myself",
  "Merge it into Inspiration",
];
