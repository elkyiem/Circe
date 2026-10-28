import styles from "./styles.module.css";

interface FadeProps {
  edge: "top" | "bottom";
  opacity: number;
  height?: number;
}

/** A white wash over one edge of the frame, so captions read over the window and its content trails off. */
export function Fade({ edge, opacity, height }: FadeProps) {
  return (
    <div className={styles.fade} data-edge={edge} style={{ opacity, height }} />
  );
}
