import { IconXmark } from "@pond/icons";
import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

interface ListProps extends ComponentPropsWithoutRef<"div"> {}

function List({ className, ...props }: ListProps) {
  return <div className={cn(styles.list, className)} {...props} />;
}

interface ItemProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  label: string;
  crumb?: string;
  count: number;
  total: number;
  removeLabel: string;
  onRemove: () => void;
}

function Item({
  label,
  crumb,
  count,
  total,
  removeLabel,
  onRemove,
  className,
  ...props
}: ItemProps) {
  const mixed = count !== total;
  return (
    <span
      className={cn(styles.item, className)}
      data-mixed={mixed || undefined}
      {...props}
    >
      <span
        className={styles.label}
        title={props.title ?? (crumb ? `${crumb} › ${label}` : label)}
      >
        {crumb ? (
          <>
            <span className={styles.crumb}>{crumb}</span>
            <span aria-hidden className={styles.separator}>
              ›
            </span>
          </>
        ) : null}
        <span className={styles.name}>{label}</span>
        {mixed ? (
          <span className={styles.count}>
            {count}/{total}
          </span>
        ) : null}
      </span>
      <Button
        icon
        size="xs"
        variant="ghost"
        rounding="full"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <IconXmark size={12} />
      </Button>
    </span>
  );
}

export const AssignmentChip = { List, Item };
