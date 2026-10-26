import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { pageHidden } from "../shared/page-hidden";

export function Reveal({
  children,
  visible = true,
  className,
  width,
  initial = true,
}: {
  children: ReactNode;
  visible?: boolean;
  className?: string;
  width?: number;
  initial?: boolean;
}) {
  const instant = useReducedMotionConfig() || pageHidden();
  return (
    <AnimatePresence initial={initial}>
      {visible ? (
        <motion.div
          className={className}
          initial={
            instant
              ? false
              : { opacity: 0, ...(width ? { width: 0 } : { height: 0 }) }
          }
          animate={{ opacity: 1, ...(width ? { width } : { height: "auto" }) }}
          exit={{ opacity: 0, ...(width ? { width: 0 } : { height: 0 }) }}
          transition={
            instant
              ? { duration: 0 }
              : { type: "spring", duration: 0.22, bounce: 0 }
          }
          style={{
            overflow: "hidden",
            minWidth: 0,
            height: width ? "100%" : undefined,
            flexShrink: width ? 0 : undefined,
            maxWidth: width ? "100%" : undefined,
          }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
