import { IconMinus, IconPlus } from "@pond/icons";
import { Button } from "@pond/ui/button";
import styles from "./styles.module.css";

/** The board's zoom control, floating at the top center. */
export function Zoom({ zoom }: { zoom: number }) {
  return (
    <div className={styles.zoom}>
      <Button icon size="md" variant="text" aria-label="Zoom Out">
        <IconMinus />
      </Button>
      <Button size="md" variant="text" className={styles.level}>
        {Math.round(zoom * 100)}%
      </Button>
      <Button icon size="md" variant="text" aria-label="Zoom In">
        <IconPlus />
      </Button>
    </div>
  );
}
