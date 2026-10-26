import { ContentRow, Switch } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import { describeWhen } from "@shared/fish-routine";
import { setRoutinePaused } from "../../../lib/menu";
import { fish as fishStore } from "../../../state/fish";
import styles from "./styles.module.css";

export function RoutineList({ fish }: { fish: FishSummary }) {
  if (!fish.routines.length)
    return <p className={styles.empty}>Ask in chat to set a routine.</p>;
  return (
    <div className={styles.list}>
      {fish.routines.map((routine) => (
        <ContentRow.Root key={routine.id} hover="row" className={styles.row}>
          <ContentRow.Trigger
            onClick={() => fishStore.openRoutine(fish.id, routine.id)}
          >
            <ContentRow.Content>
              <ContentRow.Title>{routine.name}</ContentRow.Title>
              <ContentRow.Description>
                {routine.paused ? "Paused" : describeWhen(routine.when)}
              </ContentRow.Description>
            </ContentRow.Content>
          </ContentRow.Trigger>
          <Switch.Root
            checked={!routine.paused}
            aria-label={`${routine.paused ? "Resume" : "Pause"} ${routine.name}`}
            onCheckedChange={(checked) =>
              setRoutinePaused(fish, routine, !checked)
            }
          />
        </ContentRow.Root>
      ))}
    </div>
  );
}
