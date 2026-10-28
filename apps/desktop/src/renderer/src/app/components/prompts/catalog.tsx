import {
  IconBracketsCurly,
  IconEnvelope,
  IconLink2,
  IconSparkleFill,
  IconTrophyFill,
  IconWindowDownload,
} from "@pond/icons";
import {
  IconAnthropic,
  IconGithub,
  IconXTwitterGlyph,
} from "@pond/icons/social-media";
import type { ReactNode } from "react";
import { openSettings } from "@/shared/lib/open-settings";
import { notify, TOAST_TIMEOUT_MS } from "@/shared/lib/toast";
import { type PromptId, readImportedFrom } from "@/shared/state/prompts";

const SITE = "https://pond.raphaelsalaja.com";
const COSIGN = "https://cosign.co/awards/design";
const GITHUB = "https://github.com/raphaelsalaja/pond";
const X = "https://x.com/raphaelsalaja";
const FEEDBACK = "mailto:raphaelsalaja@gmail.com?subject=Pond%20feedback";

export type PromptTone = "gold" | "accent" | "neutral";

export interface PromptSpec {
  icon: ReactNode;
  tone: PromptTone;
  title: string;
  description: string;
  note?: string;
  confirm: string;
  cancel?: string;
  run: (helpers: { openExtension: () => void }) => void | Promise<void>;
}

function visit(url: string): void {
  void window.pond.openExternal(url);
}

function shareMilestone(count: string): void {
  const text = `My Pond library passed ${count} saves. Pond is a free, open-source archiver for everything you save online. ${SITE}`;
  visit(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}

function milestone(count: string): PromptSpec {
  return {
    icon: <IconSparkleFill size={28} />,
    tone: "gold",
    title: `${count} Saves`,
    description: `Your library passed ${count} saves, all kept on this computer. Thanks for building it with Pond.`,
    confirm: "Share on X",
    cancel: "Close",
    run: () => shareMilestone(count),
  };
}

function importedName(): string {
  return readImportedFrom() === "mymind" ? "mymind" : "Eagle";
}

export function promptSpec(id: PromptId): PromptSpec {
  switch (id) {
    case "cosign":
      return {
        icon: <IconTrophyFill size={28} />,
        tone: "gold",
        title: "Pond's Maker Is Nominated",
        description:
          "Raphael, who makes Pond, is up for People Design at the Cosign Awards 2026. If Pond helps you, a vote helps more people find it.",
        note: "Voting closes November 18. Your vote stays private.",
        confirm: "Vote for Raphael",
        run: () => visit(COSIGN),
      };
    case "milestone-10000":
      return milestone("10,000");
    case "milestone-1000":
      return milestone("1,000");
    case "friend": {
      const name = importedName();
      return {
        icon: <IconLink2 size={28} />,
        tone: "accent",
        title: "Bring a Friend Along",
        description: `Your ${name} library lives in Pond now. If you know someone else moving off ${name}, send them the link.`,
        confirm: "Copy Link",
        run: async () => {
          await window.pond.query("clipboard.writeText", { text: SITE });
          notify({
            id: "prompt-link",
            title: "Link copied",
            timeout: TOAST_TIMEOUT_MS,
          });
        },
      };
    }
    case "github":
      return {
        icon: <IconGithub />,
        tone: "neutral",
        title: "Star Pond on GitHub",
        description:
          "Pond updates itself from its GitHub releases. A star there helps more people find it.",
        confirm: "Star on GitHub",
        run: () => visit(GITHUB),
      };
    case "x":
      return {
        icon: <IconXTwitterGlyph />,
        tone: "neutral",
        title: "Follow Along on X",
        description:
          "Your X saves are in Pond now. Follow Raphael for new features and fixes as they ship.",
        confirm: "Follow on X",
        run: () => visit(X),
      };
    case "extension":
      return {
        icon: <IconWindowDownload size={28} />,
        tone: "accent",
        title: "Save From Your Browser",
        description:
          "The Pond extension saves pages and images from your browser into your library.",
        confirm: "Get the Extension",
        run: ({ openExtension }) => openExtension(),
      };
    case "mcp-cursor":
      return {
        icon: <IconBracketsCurly size={28} />,
        tone: "neutral",
        title: "Search Pond From Cursor",
        description:
          "Connect Cursor so it can search your library. Everything stays on this computer.",
        confirm: "Add to Cursor",
        run: async () => {
          await window.pond.query("agent.openMcpInstall", { id: "cursor" });
        },
      };
    case "mcp-claude":
      return {
        icon: <IconAnthropic />,
        tone: "neutral",
        title: "Search Pond From Claude",
        description:
          "Connect Claude Desktop so it can search your library. Everything stays on this computer.",
        confirm: "Set Up Claude",
        run: () => openSettings("mcp"),
      };
    case "feedback":
      return {
        icon: <IconEnvelope size={28} />,
        tone: "accent",
        title: "Share Your Feedback",
        description:
          "You've used Pond for two weeks. Tell Raphael what works and what gets in your way.",
        confirm: "Send Feedback",
        run: () => visit(FEEDBACK),
      };
  }
}
