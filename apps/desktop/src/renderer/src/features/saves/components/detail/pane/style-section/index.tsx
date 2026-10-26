import {
  IconCamera,
  IconContrast,
  IconCopy,
  IconCube,
  IconGrid,
  IconHistory,
  IconImage,
  IconLayers,
  IconLightbulb,
  IconLightbulbFill,
  IconNodes3,
  IconPaintbrush,
  IconPalette,
  IconScanImage,
  IconSparkle,
  IconSquare,
  IconTextA,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { copyValue } from "@/features/saves/lib/actions";
import { Section } from "@/shared/components/inspector-section";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import styles from "./styles.module.css";

const STYLE_ICONS = new Map<string, IconComponent>([
  ["minimalist", IconSquare],
  ["maximalist", IconLayers],
  ["vintage", IconHistory],
  ["modern", IconSparkle],
  ["brutalist", IconGrid],
  ["colorful", IconPalette],
  ["monochrome", IconContrast],
  ["dark", IconLightbulb],
  ["bright", IconLightbulbFill],
  ["illustration", IconPaintbrush],
  ["photograph", IconCamera],
  ["3d render", IconCube],
  ["diagram", IconNodes3],
  ["screenshot", IconScanImage],
  ["typography", IconTextA],
]);

function styleName(label: string): string {
  return label
    .split(" ")
    .map((word) =>
      /^\d+d$/i.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function StyleSection({ labels }: { labels: readonly string[] }) {
  return (
    <Section title="Style" empty={labels.length === 0}>
      <ol className={styles.table}>
        {labels.map((label, index) => {
          const name = styleName(label);
          const Icon = STYLE_ICONS.get(label.toLowerCase()) ?? IconImage;
          return (
            <SpecContextMenu
              key={label}
              buildItems={() => [
                {
                  label: "Copy Style",
                  icon: <IconCopy />,
                  onClick: () =>
                    void copyValue("Style", name).catch(() => undefined),
                },
              ]}
            >
              <li className={styles.row} data-top={index === 0 || undefined}>
                <span className={styles.rank}>{index + 1}</span>
                <span className={styles.icon} aria-hidden>
                  <Icon size={14} />
                </span>
                <span className={styles.name}>{name}</span>
                {index === 0 ? (
                  <span className={styles.badge}>Top Match</span>
                ) : null}
              </li>
            </SpecContextMenu>
          );
        })}
      </ol>
    </Section>
  );
}
