import {
  IconArrowsExpandY,
  IconArrowUpRight,
  IconBookmark,
  IconCamera,
  IconChevronRight,
  IconCoffee,
  IconCrop,
  IconGear3,
  IconImages,
  IconKeyboard,
} from "@pond/icons";
import {
  IconBrandArena,
  IconBrandCosmos,
  IconBrandThreads,
  IconInstagram,
  IconPinterest,
  IconReddit,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import type { ExternalSource } from "@pond/schema/sources";
import { BrandTile } from "@pond/ui/brand-tile";
import { Button } from "@pond/ui/button";
import { Empty } from "@pond/ui/empty";
import { Keyboard } from "@pond/ui/keyboard";
import { Loader } from "@pond/ui/loader";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useState,
} from "react";
import { HOOK_SOURCES, harvestSourceForUrl } from "@/sources";
import {
  type CaptureTool,
  sendMessage,
  type ToolResult,
} from "@/utils/messaging";
import { useLibrary } from "@/utils/use-library";
import { useActiveTab, useShortcuts } from "../hooks";
import { ConnectionPanel } from "./connection";
import { ShortcutsPanel } from "./shortcuts";
import styles from "./styles.module.css";

const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";

interface Command {
  tool: CaptureTool;
  label: string;
  command: string;
  icon: ReactNode;
}

const GROUPS: readonly { label: string; commands: readonly Command[] }[] = [
  {
    label: "Save",
    commands: [
      {
        tool: "page",
        label: "Save Page",
        command: "save-page",
        icon: <IconBookmark size={16} />,
      },
      {
        tool: "images",
        label: "Save Images",
        command: "save-images",
        icon: <IconImages size={16} />,
      },
    ],
  },
  {
    label: "Capture",
    commands: [
      {
        tool: "region",
        label: "Capture Region",
        command: "screenshot-region",
        icon: <IconCrop size={16} />,
      },
      {
        tool: "visible",
        label: "Capture Visible Area",
        command: "screenshot-visible",
        icon: <IconCamera size={16} />,
      },
      {
        tool: "full",
        label: "Capture Full Page",
        command: "screenshot-full",
        icon: <IconArrowsExpandY size={16} />,
      },
    ],
  },
];

const LOGOS = {
  twitter: IconXTwitter,
  instagram: IconInstagram,
  pinterest: IconPinterest,
  arena: IconBrandArena,
  cosmos: IconBrandCosmos,
  tiktok: IconTikTok,
  youtube: IconYoutube,
  reddit: IconReddit,
  threads: IconBrandThreads,
} satisfies Record<ExternalSource, ComponentType<SVGProps<SVGSVGElement>>>;

function Harvest({
  source,
  disabled,
  onRun,
}: {
  source: ExternalSource;
  disabled: boolean;
  onRun: () => void;
}) {
  const Logo = LOGOS[source];
  return (
    <nav className={styles.group} aria-label="Harvest">
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        disabled={disabled}
        onClick={onRun}
      >
        <BrandTile size={16}>
          <Logo />
        </BrandTile>
        <span className={styles.label}>
          Harvest {HOOK_SOURCES[source].item}
        </span>
      </Button>
    </nav>
  );
}

function hostOf(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function Shell({
  children,
  returned,
}: {
  children: ReactNode;
  returned?: boolean;
}) {
  return (
    <div className={styles.page} data-returned={returned || undefined}>
      {children}
    </div>
  );
}

async function openPondSettings() {
  if (await sendMessage("openPond", "settings/extension")) window.close();
}

function MoreRows({
  onShortcuts,
  onConnection,
}: {
  onShortcuts: () => void;
  onConnection(): void;
}) {
  return (
    <div className={styles.group}>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={onConnection}
      >
        <IconGear3 size={16} />
        <span className={styles.label}>Connection</span>
        <IconChevronRight size={12} className={styles.trailing} />
      </Button>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={onShortcuts}
      >
        <IconKeyboard size={16} />
        <span className={styles.label}>Shortcuts</span>
        <IconChevronRight size={12} className={styles.trailing} />
      </Button>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={() => void openPondSettings()}
      >
        <IconGear3 size={16} />
        <span className={styles.label}>Settings</span>
        <IconArrowUpRight size={12} className={styles.trailing} />
      </Button>
      <Button
        variant="ghost"
        width="full"
        className={styles.row}
        onClick={() => void browser.tabs.create({ url: BUY_ME_A_COFFEE })}
      >
        <IconCoffee size={16} />
        <span className={styles.label}>Buy Me a Coffee</span>
        <IconArrowUpRight size={12} className={styles.trailing} />
      </Button>
    </div>
  );
}

export function App() {
  const library = useLibrary();
  const [view, setView] = useState<
    "commands" | "shortcuts" | "connection" | "returned"
  >("commands");

  if (view === "shortcuts")
    return <ShortcutsPanel onBack={() => setView("returned")} />;
  if (view === "connection")
    return (
      <ConnectionPanel
        onBack={() => {
          setView("returned");
          void library.refresh();
        }}
      />
    );
  return (
    <Commands
      {...library}
      returned={view === "returned"}
      onShortcuts={() => setView("shortcuts")}
      onConnection={() => setView("connection")}
    />
  );
}

interface CommandsProps extends ReturnType<typeof useLibrary> {
  returned: boolean;
  onShortcuts: () => void;
  onConnection(): void;
}

function Commands({
  result,
  refresh,
  returned,
  onShortcuts,
  onConnection,
}: CommandsProps) {
  const tab = useActiveTab();
  const shortcuts = useShortcuts();
  const [error, setError] = useState<string | null>(null);

  if (!result || tab === undefined) {
    return (
      <Shell>
        <div className={styles.center}>
          <Loader.Root aria-label="Connecting to Pond">
            <Loader.Spinner />
          </Loader.Root>
        </div>
      </Shell>
    );
  }

  if (result.state === "offline") {
    return (
      <Shell returned={returned}>
        <Empty.Root className={styles.center}>
          <Empty.Title>
            {result.message ? "Iris needs attention" : "Pond isn't running"}
          </Empty.Title>
          <Empty.Description>
            {result.message ??
              "Open Pond on your computer, or choose Connection to pair with Iris."}
          </Empty.Description>
          <Empty.Action className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() =>
                result.iris
                  ? onConnection()
                  : void sendMessage("openPond", undefined)
              }
            >
              {result.iris ? "Connect Iris" : "Open Pond"}
            </Button>
            <Button variant="primary" onClick={() => void refresh()}>
              Try Again
            </Button>
          </Empty.Action>
        </Empty.Root>
        <MoreRows onShortcuts={onShortcuts} onConnection={onConnection} />
      </Shell>
    );
  }

  const host = hostOf(tab?.url);
  const tabId = host ? tab?.id : undefined;
  const harvest = host && tab?.url ? harvestSourceForUrl(tab.url) : null;

  const run = async (tool: CaptureTool) => {
    if (tabId === undefined) return;
    const outcome = await sendMessage("runTool", { tabId, tool }).catch(
      (): ToolResult => ({
        ok: false,
        message: "Pond couldn't start this capture. Try again.",
      }),
    );
    if (outcome.ok) window.close();
    else setError(outcome.message);
  };

  return (
    <Shell returned={returned}>
      {tabId === undefined ? (
        <p className={styles.notice} role="status">
          Pond can't capture this page. Open a regular web page to save it.
        </p>
      ) : null}
      {error ? (
        <p key={error} className={styles.notice} role="alert" data-error>
          {error}
        </p>
      ) : null}
      {harvest ? (
        <Harvest
          source={harvest}
          disabled={tabId === undefined}
          onRun={() => void run("page")}
        />
      ) : null}
      {GROUPS.map((group) => (
        <nav
          key={group.label}
          className={styles.group}
          aria-label={group.label}
        >
          {group.commands.map(({ tool, label, command, icon }) => {
            const keys = shortcuts.get(command);
            return (
              <Button
                key={tool}
                variant="ghost"
                width="full"
                className={styles.row}
                disabled={tabId === undefined}
                onClick={() => void run(tool)}
              >
                {icon}
                <span className={styles.label}>{label}</span>
                {keys ? (
                  <Keyboard.Cluster keys={keys} density="inline" />
                ) : null}
              </Button>
            );
          })}
        </nav>
      ))}
      <MoreRows onShortcuts={onShortcuts} onConnection={onConnection} />
    </Shell>
  );
}
