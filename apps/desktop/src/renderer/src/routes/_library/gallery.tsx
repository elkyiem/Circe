import { createFileRoute, redirect } from "@tanstack/react-router";
import { Gallery } from "@/app/components/gallery";

export const Route = createFileRoute("/_library/gallery")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  component: Gallery,
});
