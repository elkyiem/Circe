import { Button, cssVars, Sidebar, Toggle, ToggleGroup } from "@pond/ui";
import {
  FISH_SPECIES,
  type FishColor,
  type FishPresence,
  type FishSpecies,
  type FishSummary,
} from "@shared/fish-contracts";
import { useState } from "react";
import {
  FishMark,
  type FishMood,
  FishRow,
  SPECIES_LABELS,
} from "@/features/fish";
import styles from "./styles.module.css";

type Theme = "light" | "dark";

const SIZES = [16, 24, 40, 64] as const;
type Size = (typeof SIZES)[number];

const COLORS = {
  koi: "orange",
  goldfish: "gold",
  puffer: "teal",
  clownfish: "red",
  angelfish: "purple",
  shark: "blue",
  anglerfish: "green",
  sunfish: "pink",
} satisfies Record<FishSpecies, FishColor>;

const STATES: readonly {
  label: string;
  activity: FishPresence;
  mood: FishMood;
}[] = [
  { label: "Idle", activity: null, mood: "calm" },
  { label: "Thinking", activity: "thinking", mood: "busy" },
  { label: "Reading", activity: "reading", mood: "busy" },
  { label: "Writing", activity: "writing", mood: "busy" },
  { label: "New result", activity: null, mood: "pleased" },
  { label: "Failed", activity: null, mood: "worried" },
];

const NOW = Date.now();
const MINUTE = 60_000;

function sample(
  fields: Pick<FishSummary, "id" | "name" | "species"> & Partial<FishSummary>,
): FishSummary {
  return {
    color: COLORS[fields.species],
    instructions: "",
    scope: { folderIds: [], tags: [] },
    model: null,
    routines: [],
    lastRun: null,
    createdAt: NOW,
    updatedAt: NOW,
    activity: null,
    latest: null,
    ...fields,
  };
}

const ROWS: readonly FishSummary[] = [
  sample({
    id: "gallery-idle",
    name: "Koi",
    species: "koi",
    latest: { from: "fish", text: "Done for today", at: NOW - 12 * MINUTE },
  }),
  sample({
    id: "gallery-thinking",
    name: "Bubbles",
    species: "goldfish",
    activity: "thinking",
  }),
  sample({
    id: "gallery-reading",
    name: "Spike",
    species: "puffer",
    activity: "reading",
  }),
  sample({
    id: "gallery-pleased",
    name: "Nemo",
    species: "clownfish",
    lastRun: {
      chatId: null,
      at: NOW - 4 * MINUTE,
      status: "done",
      changes: 3,
      seen: false,
    },
  }),
  sample({
    id: "gallery-worried",
    name: "Bruce",
    species: "shark",
    lastRun: {
      chatId: null,
      at: NOW - 30 * MINUTE,
      status: "failed",
      error: "Your API key expired. Add a new key in Settings.",
      changes: 0,
      seen: false,
    },
  }),
];

export function FishGallery({ themes }: { themes: readonly Theme[] }) {
  const [size, setSize] = useState<Size>(40);
  const [round, setRound] = useState(0);

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Fish</h2>
        <ToggleGroup
          aria-label="Fish size"
          value={[String(size)]}
          onValueChange={(value) => {
            const next = SIZES.find((option) => String(option) === value[0]);
            if (next) setSize(next);
          }}
        >
          {SIZES.map((option) => (
            <Toggle key={option} size="sm" value={String(option)}>
              {option}
            </Toggle>
          ))}
        </ToggleGroup>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRound((r) => r + 1)}
        >
          Replay
        </Button>
      </header>

      <div className={styles.frames} key={round}>
        {themes.map((theme) => (
          <div key={theme} className={styles.frame} data-theme={theme}>
            <div
              className={styles.grid}
              style={cssVars({
                "--cell": `${Math.max(Math.round(size * 1.7), 56)}px`,
                "--states": STATES.length,
              })}
            >
              <span />
              {STATES.map((state) => (
                <span key={state.label} className={styles.label}>
                  {state.label}
                </span>
              ))}
              {FISH_SPECIES.map((species) => (
                <div key={species} className={styles.row}>
                  <span className={styles.species}>
                    {SPECIES_LABELS[species]}
                  </span>
                  {STATES.map((state) => (
                    <span key={state.label} className={styles.cell}>
                      <FishMark
                        color={COLORS[species]}
                        species={species}
                        activity={state.activity}
                        mood={state.mood}
                        size={size}
                      />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className={styles.subheading}>Sidebar rows</h3>
      <div className={styles.frames} key={`rows-${round}`}>
        {themes.map((theme) => (
          <div key={theme} className={styles.frame} data-theme={theme}>
            <div inert>
              <Sidebar.Root>
                {ROWS.map((fish) => (
                  <FishRow key={fish.id} fish={fish} active={false} />
                ))}
              </Sidebar.Root>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
