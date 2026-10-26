import type { ComponentType, ReactNode } from "react";
import { FILE_MANAGER, THIS_DEVICE } from "@/shared/lib/platform";
import type { StepId, StepProps } from "../model";
import { ThemeOptions, ThemePreview } from "./appearance";
import { AssistantOptions, AssistantPreview } from "./assistant";
import { Customize } from "./customize";
import { Features } from "./features";
import { Imports } from "./import";
import { Library, Links } from "./library";
import { Mark, Owner } from "./welcome";

interface ProfileCopy {
  new: string;
  existing: string;
}

interface StepSpec {
  layout: "hero" | "split" | "bento";
  title: ProfileCopy;
  description: ProfileCopy;
  primary: ProfileCopy;
  /** Below the description, or the right pane in the split layout. The bento layout passes the header as children. */
  Body: ComponentType<StepProps & { children?: ReactNode }>;
  /** Above the title. */
  Lead?: ComponentType<StepProps>;
  /** Split layout only, below the description. */
  Aside?: ComponentType<StepProps>;
  /** Centered in the footer. */
  Extras?: ComponentType<StepProps>;
}

function same(text: string): ProfileCopy {
  return { new: text, existing: text };
}

export function stepSpec(id: StepId): StepSpec {
  return STEPS[id];
}

const STEPS = {
  welcome: {
    layout: "split",
    title: {
      new: "Everyone Deserves Their Own Pond",
      existing: "Welcome Back",
    },
    description: {
      new: `Keep what you save on X, Instagram, Pinterest, and more in one folder on ${THIS_DEVICE}. Free, open source, and yours to keep.`,
      existing:
        "See what's new and check your setup. Nothing changes until you finish.",
    },
    primary: same("Get Started"),
    Lead: Mark,
    Aside: Owner,
    Body: Features,
  },
  customize: {
    layout: "bento",
    title: same("Make It Yours"),
    description: same(
      `Choose what Pond does with your Saves. Everything runs on ${THIS_DEVICE}, and you can change it later in Settings.`,
    ),
    primary: same("Continue"),
    Body: Customize,
  },
  appearance: {
    layout: "split",
    title: same("Pick a Look"),
    description: same(
      "Follow your system or choose light or dark. Each mode has its own theme.",
    ),
    primary: same("Continue"),
    Aside: ThemeOptions,
    Body: ThemePreview,
  },
  assistant: {
    layout: "split",
    title: same("Fish"),
    description: same(
      "Fish answer questions about your Library and tidy it on request. Pond doesn't bundle a chat model, so connect one you already use.",
    ),
    primary: same("Continue"),
    Aside: AssistantOptions,
    Body: AssistantPreview,
  },
  library: {
    layout: "hero",
    title: { new: "Create Your Library", existing: "Your Library" },
    description: {
      new: `Your originals stay as regular files in this folder. Open them in ${FILE_MANAGER} or back them up like any other folder.`,
      existing:
        "Your Library stays where it is unless you move it. Every Save moves with it.",
    },
    primary: { new: "Create Library", existing: "Open Library" },
    Body: Library,
  },
  import: {
    layout: "hero",
    title: same("Bring Your Saves"),
    description: same(
      `Import from Eagle, mymind, your browser, or files on ${THIS_DEVICE}. Imports keep running after you finish, and you can import more from the New menu.`,
    ),
    primary: { new: "Start Using Pond", existing: "Done" },
    Body: Imports,
    Extras: Links,
  },
} satisfies Record<StepId, StepSpec>;
