import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AgentPane } from "@/features/agent/components/pane";
import { assistant } from "@/features/agent/state/assistant";
import { fish, useFish } from "@/features/fish";

export const Route = createFileRoute("/_library/fish/$fishId")({
  component: FishPage,
});

function FishPage() {
  const { fishId } = Route.useParams();
  const run = useFish(fishId)?.lastRun;
  const unseenRun = run && !run.seen ? run : null;

  useEffect(() => {
    assistant.selectFish(fishId);
  }, [fishId]);

  useEffect(() => {
    if (!unseenRun) return;
    if (unseenRun.chatId) void assistant.openChat(unseenRun.chatId);
    void fish.markSeen(fishId).catch(() => undefined);
  }, [fishId, unseenRun]);

  return <AgentPane />;
}
