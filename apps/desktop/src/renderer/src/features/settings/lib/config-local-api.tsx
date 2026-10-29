import {
  defineCustomSection,
  group,
} from "@/features/settings/lib/engine-types";
import { hostDeviceName } from "@/shared/lib/platform";

export const localApiSection = defineCustomSection({
  title: "Local API",
  description: `Let scripts and apps on ${hostDeviceName()} use this library over HTTP while Pond is open.`,
  keywords: [
    "api",
    "http",
    "token",
    "tokens",
    "scripts",
    "integrations",
    "developer",
    "revoke",
  ],
  groups: [
    group.plain({
      items: [
        {
          control: "custom",
          key: "tokens",
          title: "Tokens",
          keywords: ["new token", "revoke", "access", "scopes"],
          render: () => null,
        },
      ],
    }),
  ],
});
