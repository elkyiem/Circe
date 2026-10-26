import type { ChangelogEntry } from "@pond/schema/changelog";
import { Button, Changelog, Dialog } from "@pond/ui";
import { useEffect, useRef } from "react";
import { loadAppInfo } from "@/shared/lib/app-info";
import {
  readWhatsNewSeen,
  useWhatsNewDialog,
  whatsNewDialog,
  writeWhatsNewSeen,
} from "@/shared/state/whats-new";
import { CHANGELOG, unseenVersions } from "./entries";
import styles from "./styles.module.css";

const RELEASES_URL = "https://github.com/raphaelsalaja/pond/releases";
const CHECK_DELAY_MS = 1500;

/** Opens once per version change, after the Library has had a moment to load. */
function useShowAfterUpdate(): void {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { version } = await loadAppInfo();
        const lastSeen = readWhatsNewSeen();
        if (!active || lastSeen === version) return;
        const hasSaves =
          lastSeen !== null ||
          (await window.pond.query("saves.sidebarCounts", {})).library > 0;
        if (!active) return;
        writeWhatsNewSeen(version);
        const versions = unseenVersions({
          entries: CHANGELOG,
          current: version,
          lastSeen,
          hasSaves,
        });
        if (versions.length > 0) whatsNewDialog.open(versions);
      } catch {}
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

function Entry({
  entry,
  showVersion,
}: {
  entry: ChangelogEntry;
  showVersion: boolean;
}) {
  return (
    <Changelog.Entry>
      {showVersion ? (
        <Changelog.Meta>
          <Changelog.Version>v{entry.version}</Changelog.Version>
        </Changelog.Meta>
      ) : null}
      <Changelog.Body>
        <Changelog.Title>{entry.title}</Changelog.Title>
        <Changelog.Summary>{entry.summary}</Changelog.Summary>
        {entry.sections.map((section) => (
          <Changelog.Section key={section.category} category={section.category}>
            <Changelog.Heading />
            <Changelog.List>
              {section.items.map((item) => (
                <Changelog.Item key={item}>{item}</Changelog.Item>
              ))}
            </Changelog.List>
          </Changelog.Section>
        ))}
      </Changelog.Body>
    </Changelog.Entry>
  );
}

export function WhatsNewDialog() {
  const { open, versions } = useWhatsNewDialog();
  const doneRef = useRef<HTMLButtonElement>(null);
  useShowAfterUpdate();

  const filtered = versions
    ? CHANGELOG.filter((entry) => versions.includes(entry.version))
    : CHANGELOG;
  const entries = filtered.length > 0 ? filtered : CHANGELOG;
  const latest = entries[0];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) whatsNewDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} initialFocus={doneRef}>
          <Dialog.Header className={styles.header}>
            <Dialog.Title className={styles.title}>
              What's New
              {latest ? (
                <span className={styles.version}>v{latest.version}</span>
              ) : null}
            </Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            <Changelog.Root>
              {entries.map((entry) => (
                <Entry
                  key={entry.version}
                  entry={entry}
                  showVersion={entries.length > 1}
                />
              ))}
            </Changelog.Root>
          </Dialog.Content>
          <Dialog.Footer>
            <Button
              variant="secondary"
              onClick={() => void window.pond.openExternal(RELEASES_URL)}
            >
              All Releases
            </Button>
            <Dialog.Confirm
              ref={doneRef}
              onClick={() => whatsNewDialog.close()}
            >
              Done
            </Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
