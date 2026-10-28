import {
  IconAlbum2,
  IconArrowLeft,
  IconArrowRight,
  IconChatBubble,
  IconChevronRight,
  IconSidebarLeft,
} from "@pond/icons";
import type { CSSProperties, ReactNode } from "react";
import {
  APP_HEIGHT,
  APP_WIDTH,
  WINDOW_LEFT,
  WINDOW_TOP,
  ZOOM,
} from "../geometry";
import styles from "./styles.module.css";

interface WindowProps {
  /** The top bar's breadcrumb; `trail` is a save or folder opened inside it. */
  crumb?: { icon: ReactNode; label: string; trail?: string };
  /** `2.0` draws one white surface with the breadcrumb past the wider sidebar. */
  look?: "1.0" | "2.0";
  /** Motion for the whole window, such as a rise or a recede blur. Scales from 50% 40%. */
  style?: CSSProperties;
  children: ReactNode;
}

/** Pond's window chrome at the app's real size, zoomed to read at 1080p. Children use app coordinates. */
export function Window({
  crumb = { icon: <IconAlbum2 size={16} />, label: "All" },
  look = "1.0",
  style,
  children,
}: WindowProps) {
  return (
    <div
      className={styles.window}
      data-look={look}
      style={{
        left: WINDOW_LEFT,
        top: WINDOW_TOP,
        width: APP_WIDTH * ZOOM,
        height: APP_HEIGHT * ZOOM,
        ...style,
      }}
    >
      <div className={styles.chrome}>
        <div
          className={styles.app}
          style={{
            width: APP_WIDTH,
            height: APP_HEIGHT,
            transform: `scale(${ZOOM})`,
          }}
        >
          <header className={styles.top}>
            <span className={styles.lights}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.nav}>
              <IconSidebarLeft size={16} />
              <span className={styles.history}>
                <IconArrowLeft size={16} />
                <IconArrowRight size={16} />
              </span>
            </span>
            <span className={styles.crumb}>
              {crumb.icon}
              {crumb.label}
              {crumb.trail ? (
                <>
                  <IconChevronRight size={12} className={styles.separator} />
                  <span className={styles.trail}>{crumb.trail}</span>
                </>
              ) : null}
            </span>
            <span className={styles.actions}>
              <IconChatBubble size={16} />
              <IconSidebarLeft size={16} className={styles.flip} />
            </span>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
