import {
  IconChatBubble,
  IconCircleInfo,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import {
  DEFAULT_FISH_ID,
  type Fish,
  type FishPatch,
  type FishRoutine,
} from "@shared/fish-contracts";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { fishIntroDialog } from "@/shared/state/fish-intro";
import { fish } from "../state/fish";

async function runFishAction(
  action: () => Promise<void>,
  title = "Couldn't update this fish",
): Promise<void> {
  try {
    await action();
  } catch (error) {
    notify({
      id: "fish-action",
      title,
      description: errorCopy(error, "Try again."),
    });
  }
}

export function createFish(): void {
  void runFishAction(async () => {
    const created = await fish.create();
    fish.open(created.id);
    fish.startEditing(created.id);
  });
}

export function runRoutine(target: Fish, routine: FishRoutine): void {
  void runFishAction(async () => {
    await fish.run(target.id, routine.id);
    notify({
      id: "fish-run",
      title: `${target.name} is on it`,
      description: "The result shows up in its chat.",
    });
  }, "Couldn't start the routine");
}

export function updateFish(target: Fish, patch: FishPatch): void {
  void runFishAction(async () => {
    await fish.update(target.id, patch);
  });
}

export function setRoutinePaused(
  target: Fish,
  routine: FishRoutine,
  paused: boolean,
): void {
  void runFishAction(() => fish.pauseRoutine(target.id, routine.id, paused));
}

export function confirmDeleteRoutine(target: Fish, routine: FishRoutine): void {
  Dialog.confirm({
    title: `Delete "${routine.name}"`,
    description: `${target.name} stops running it. You can't undo this.`,
    confirmLabel: "Delete",
    confirmVariant: "destructive",
    onConfirm: () =>
      runFishAction(
        () => fish.deleteRoutine(target.id, routine.id),
        "Couldn't delete the routine",
      ),
  });
}

function confirmDeleteFish(target: Fish): void {
  Dialog.confirm({
    title: `Delete "${target.name}"`,
    description: `This deletes its conversation. Your Saves stay in your Library.`,
    confirmLabel: "Delete",
    confirmVariant: "destructive",
    onConfirm: () => runFishAction(() => fish.remove(target.id)),
  });
}

export function sectionItems(): MenuItemSpec[] {
  return [
    { label: "New Fish", icon: <IconPlus />, onClick: createFish },
    {
      label: "About Fish",
      icon: <IconCircleInfo />,
      onClick: () => fishIntroDialog.open(),
    },
  ];
}

/** Actions for the fish whose conversation is open. */
export function fishPaneItems(target: Fish): MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    {
      label: "Edit Fish",
      icon: <IconPencil />,
      onClick: () => fish.startEditing(target.id),
    },
    { type: "separator" },
    { label: "New Fish", icon: <IconPlus />, onClick: createFish },
  ];
  if (target.id !== DEFAULT_FISH_ID)
    items.push(
      { type: "separator" },
      {
        label: "Delete",
        icon: <IconTrash />,
        variant: "destructive",
        onClick: () => confirmDeleteFish(target),
      },
    );
  return items;
}

export function fishItems(target: Fish): MenuItemSpec[] {
  return [
    {
      label: "Open Chat",
      icon: <IconChatBubble />,
      onClick: () => fish.open(target.id),
    },
    ...fishPaneItems(target),
  ];
}
