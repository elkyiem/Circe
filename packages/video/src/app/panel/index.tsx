import type { ReactNode } from "react";
import styles from "./styles.module.css";

/** The white content panel right of the sidebar. */
export function Panel({ children }: { children?: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}
