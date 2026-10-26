import { IconPlus } from "@pond/icons";
import { Button, Chip } from "@pond/ui";
import { Section } from "@/shared/components/inspector-section";
import styles from "./styles.module.css";

export function SuggestedTags({
  names,
  onAdd,
  onAddAll,
}: {
  names: readonly string[];
  onAdd(name: string): void;
  onAddAll(): void;
}) {
  if (names.length === 0) return null;
  return (
    <Section
      title="Suggested Tags"
      action={
        <Button type="button" size="xs" variant="ghost" onClick={onAddAll}>
          Apply All
        </Button>
      }
    >
      <Chip.Root className={styles.list}>
        {names.map((name) => (
          <Chip.Action
            key={name}
            tone="suggested"
            aria-label={`Add tag ${name}`}
            onClick={() => onAdd(name)}
          >
            <IconPlus size={12} />
            {name}
          </Chip.Action>
        ))}
      </Chip.Root>
    </Section>
  );
}
