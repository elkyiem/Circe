import type { ReactNode } from "react";
import { HEIGHT, WIDTH } from "../video";
import styles from "./styles.module.css";

/** The 1080p white canvas every composition draws into. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame} style={{ width: WIDTH, height: HEIGHT }}>
      {children}
    </div>
  );
}
