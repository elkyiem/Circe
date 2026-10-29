import { IconFolder } from "@pond/icons";
import { Button, Dialog, Input } from "@pond/ui";
import {
  type HostLocationEntry,
  HostLocationNameSchema,
} from "@shared/web-host-locations";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useRef, useState } from "react";
import { hostDeviceName } from "@/shared/lib/platform";
import {
  finishHostLocation,
  hostLocationPickerStore,
} from "../../../browser/host-locations";
import styles from "./styles.module.css";

export function BrowserHostLocations() {
  const request = useSelector(hostLocationPickerStore, (value) => value);
  if (!request) return null;
  return <HostLocationDialog key={request.id} request={request} />;
}
function HostLocationDialog({
  request,
}: {
  request: NonNullable<typeof hostLocationPickerStore.state>;
}) {
  const [handle, setHandle] = useState(request.initial);
  const [filter, setFilter] = useState("");
  const [hidden, setHidden] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(request.name ?? "");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const destination = ["move", "backup", "restore-destination"].includes(
    request.purpose,
  );
  const inspect = request.purpose === "inspect";
  const directories =
    destination || request.purpose === "parent" || request.purpose === "watch";
  const listing = useQuery({
    queryKey: ["host-locations", request.id, handle, filter, hidden, offset],
    queryFn: () =>
      request.list({
        action: "list",
        purpose: request.purpose,
        handle,
        filter,
        hidden,
        offset,
      }),
    staleTime: 0,
  });
  const entries = listing.data?.entries ?? [];
  const choice = entries.find((entry) => entry.handle === selected);
  const target = choice ?? listing.data?.current;
  const validName = HostLocationNameSchema.safeParse(name);
  const canSelect = Boolean(
    target &&
      (!directories || target.kind === "directory") &&
      (request.purpose !== "copy" || target.kind === "library") &&
      (!destination || validName.success),
  );
  function browse(next?: string) {
    setHandle(next);
    setOffset(0);
    setFilter("");
    setSelected(null);
    setError(null);
    setNewFolder(null);
  }
  function open(entry: HostLocationEntry) {
    if (entry.kind === "directory") browse(entry.handle);
    else if (
      !directories &&
      !inspect &&
      (request.purpose !== "copy" || entry.kind === "library")
    )
      finishHostLocation({ entry });
  }
  async function createFolder() {
    const parent = listing.data?.current;
    if (!parent || newFolder === null) return;
    const parsed = HostLocationNameSchema.safeParse(newFolder);
    if (!parsed.success) {
      setError("Enter a single folder name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const entry = await request.mkdir({
        action: "mkdir",
        purpose: request.purpose,
        parent: parent.handle,
        name: parsed.data,
      });
      browse(entry.handle);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't create this folder.",
      );
    } finally {
      setCreating(false);
    }
  }
  const activeId = choice ? `host-location-${choice.handle}` : undefined;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) finishHostLocation(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title>{request.title}</Dialog.Title>
          <Dialog.Description>
            Storage on {hostDeviceName()}. Choose a folder or Library on that
            computer.
          </Dialog.Description>
          <div className={styles.navigation}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => browse()}
              disabled={!handle}
            >
              Locations
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => browse(listing.data?.parent?.handle)}
              disabled={!handle}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void listing.refetch()}
            >
              Refresh
            </Button>
            <span className={styles.path} title={listing.data?.current?.path}>
              {listing.data?.current?.path ?? "Host locations"}
            </span>
          </div>
          <Input.Root>
            <Input.Field
              aria-label="Filter host folders"
              placeholder="Filter folders…"
              value={filter}
              disabled={!handle}
              onValueChange={(value) => {
                setFilter(value);
                setOffset(0);
                setSelected(null);
              }}
            />
          </Input.Root>
          <div
            className={styles.list}
            ref={listRef}
            role="listbox"
            tabIndex={0}
            aria-label="Host folders"
            aria-activedescendant={activeId}
            aria-busy={listing.isFetching}
            onKeyDown={(event) => {
              const index = entries.findIndex(
                (entry) => entry.handle === selected,
              );
              let next = index;
              if (event.key === "ArrowDown")
                next = Math.min(entries.length - 1, index + 1);
              else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = entries.length - 1;
              else if (event.key === "Enter" && choice) {
                event.preventDefault();
                open(choice);
                return;
              } else if (event.key === "Backspace" && handle) {
                event.preventDefault();
                browse(listing.data?.parent?.handle);
                return;
              } else return;
              event.preventDefault();
              const entry = entries[next];
              if (entry) {
                setSelected(entry.handle);
                document
                  .getElementById(`host-location-${entry.handle}`)
                  ?.scrollIntoView({ block: "nearest" });
              }
            }}
          >
            {entries.map((entry) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`host-location-${entry.handle}`}
                key={entry.handle}
                aria-selected={selected === entry.handle}
                className={styles.entry}
                onClick={() => {
                  setSelected(entry.handle);
                  listRef.current?.focus();
                }}
                onDoubleClick={() => open(entry)}
              >
                <IconFolder />
                <span>{entry.name}</span>
                <small>
                  {entry.kind === "backup"
                    ? "Backup"
                    : entry.kind === "library"
                      ? "Library"
                      : "Folder"}
                </small>
              </button>
            ))}
            {!listing.isFetching && !listing.error && entries.length === 0 ? (
              <p className={styles.empty}>No folders here.</p>
            ) : null}
          </div>
          {listing.isFetching ? (
            <p role="status">Loading host folders…</p>
          ) : null}
          {listing.error || error ? (
            <p role="alert">{error ?? listing.error?.message}</p>
          ) : null}
          <div className={styles.options}>
            <label>
              <input
                type="checkbox"
                checked={hidden}
                onChange={(event) => {
                  setHidden(event.target.checked);
                  setOffset(0);
                }}
              />
              Show hidden folders
            </label>
            <span />
            {offset > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOffset(Math.max(0, offset - 500));
                  setSelected(null);
                }}
              >
                Previous folders
              </Button>
            ) : null}
            {listing.data?.nextOffset !== null &&
            listing.data?.nextOffset !== undefined ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOffset(listing.data?.nextOffset ?? 0);
                  setSelected(null);
                }}
              >
                More folders
              </Button>
            ) : null}
            {!inspect ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={listing.data?.current?.kind !== "directory"}
                onClick={() => setNewFolder("")}
              >
                New folder
              </Button>
            ) : null}
          </div>
          {newFolder !== null ? (
            <form
              className={styles.folderForm}
              onSubmit={(event) => {
                event.preventDefault();
                void createFolder();
              }}
            >
              <Input.Root>
                <Input.Field
                  autoFocus
                  aria-label="New host folder name"
                  value={newFolder}
                  onValueChange={setNewFolder}
                />
              </Input.Root>
              <Button type="submit" disabled={creating}>
                Create folder
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNewFolder(null)}
              >
                Cancel
              </Button>
            </form>
          ) : null}
          {destination ? (
            <label
              className={styles.filename}
              htmlFor="host-library-destination-name"
            >
              Name
              <Input.Root>
                <Input.Field
                  id="host-library-destination-name"
                  aria-label="Library destination name"
                  value={name}
                  onValueChange={setName}
                />
              </Input.Root>
            </label>
          ) : null}
          <div className={styles.footer}>
            <span className={styles.path}>{target?.path}</span>
            {!inspect ? (
              <Button variant="ghost" onClick={() => finishHostLocation(null)}>
                Cancel
              </Button>
            ) : null}
            <Button
              disabled={!inspect && !canSelect}
              onClick={() => {
                if (inspect) finishHostLocation(null);
                else if (target)
                  finishHostLocation({
                    entry: target,
                    name:
                      destination && validName.success
                        ? validName.data
                        : undefined,
                  });
              }}
            >
              {inspect
                ? "Done"
                : destination
                  ? "Save here"
                  : directories
                    ? "Select folder"
                    : "Open"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
