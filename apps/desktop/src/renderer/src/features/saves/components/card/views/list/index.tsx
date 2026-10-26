import { sourceLabel } from "@pond/schema/sources";
import { PreparedCardThumb } from "@/features/saves/components/card/media";
import { Card } from "@/features/saves/components/card/parts";
import type { SaveCardViewProps } from "@/features/saves/components/card/views/types";
import { saveDuration } from "@/features/saves/lib/duration";
import {
  deriveTypeLabel,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { prettifyType } from "@/features/saves/lib/presentation";
import {
  formatListDimension,
  formatListExtension,
  formatListRating,
  useListColumns,
} from "@/features/saves/state/list-columns";
import {
  formatAbsolute,
  formatBytes,
  formatDuration,
} from "@/shared/lib/format";
import styles from "./styles.module.css";

export function ListCard({ model, width }: SaveCardViewProps) {
  const columns = useListColumns();
  const save = model.save;
  const file = model.primary;
  const type = columns.type
    ? deriveTypeLabel(pickPrimaryFile(save), save)
    : null;
  const duration = columns.duration ? saveDuration(save) : null;
  return (
    <div className={styles.body}>
      <Card.Media className={styles.media}>
        <Card.Frame>
          <PreparedCardThumb
            save={save}
            view="list"
            width={width}
            mediaUnits={model.mediaUnits}
            pickOptions={model.pickOptions}
            unit={model.unit}
            primary={model.primary}
          />
        </Card.Frame>
        <Card.Overlay model={model.overlay} />
      </Card.Media>
      {columns.name ? (
        <Card.Meta className={styles.meta} title={save.title ?? save.url} />
      ) : null}
      {columns.type ? (
        <span className={styles.cell}>{type ? prettifyType(type) : "—"}</span>
      ) : null}
      {columns.source ? (
        <span className={styles.cell}>{sourceLabel(save.source)}</span>
      ) : null}
      {columns.creator ? (
        <span className={styles.cell}>{save.author?.trim() || "—"}</span>
      ) : null}
      {columns.tags ? (
        <span className={styles.cell}>{save.tags.join(", ") || "—"}</span>
      ) : null}
      {columns.dimensions ? (
        <span className={styles.cell}>
          {formatListDimension(save.width, save.height)}
        </span>
      ) : null}
      {columns.duration ? (
        <span className={styles.cell}>
          {duration ? formatDuration(duration) : "—"}
        </span>
      ) : null}
      {columns.rating ? (
        <span className={styles.cell}>{formatListRating(save.rating)}</span>
      ) : null}
      {columns.extension ? (
        <span className={styles.cell}>{formatListExtension(file?.path)}</span>
      ) : null}
      {columns.fileSize ? (
        <span className={styles.cell}>{formatBytes(save.fileSize)}</span>
      ) : null}
      {columns.dateAdded ? (
        <span className={styles.cell}>
          {formatAbsolute(save.savedAt) || "—"}
        </span>
      ) : null}
      {columns.datePublished ? (
        <span className={styles.cell}>
          {formatAbsolute(save.publishedAt) || "—"}
        </span>
      ) : null}
      {columns.annotation ? (
        <span className={styles.cell}>{save.notes?.trim() ? "Yes" : "—"}</span>
      ) : null}
    </div>
  );
}
