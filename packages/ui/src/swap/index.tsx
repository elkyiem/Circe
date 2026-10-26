import { clsx as cn } from "clsx";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotionConfig,
} from "motion/react";
import type { Key, ReactNode } from "react";
import { pageHidden } from "../shared/page-hidden";
import styles from "./styles.module.css";

interface SwapProps extends React.ComponentPropsWithoutRef<"span"> {
  value: Key;
}

export function Swap({ value, className, children, ...props }: SwapProps) {
  return (
    <span className={cn(styles.root, className)} {...props}>
      {pageHidden() ? (
        <span key={value} className={styles.item}>
          {children}
        </span>
      ) : (
        <AnimatePresence initial={false}>
          <Item key={value}>{children}</Item>
        </AnimatePresence>
      )}
    </span>
  );
}

function Item({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionConfig();
  const present = useIsPresent();
  const shift = reduced ? 0 : 4;
  const blur = reduced ? "blur(0px)" : "blur(2px)";
  return (
    <motion.span
      className={styles.item}
      inert={!present}
      initial={{
        opacity: 0,
        transform: `translateY(${shift}px)`,
        filter: blur,
      }}
      animate={{
        opacity: 1,
        transform: "translateY(0px)",
        filter: "blur(0px)",
      }}
      exit={{
        opacity: 0,
        transform: `translateY(${-shift}px)`,
        filter: blur,
      }}
      transition={{ duration: 0.15, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
}
