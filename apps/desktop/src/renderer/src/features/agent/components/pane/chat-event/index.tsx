import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface ChatEventProps extends React.ComponentPropsWithoutRef<"p"> {
  icon?: React.ReactNode;
}

export function ChatEvent({
  icon,
  className,
  children,
  ...props
}: ChatEventProps) {
  return (
    <p className={cn(styles.event, className)} {...props}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </p>
  );
}
