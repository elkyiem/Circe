import type { Prefs } from "@pond/schema";
import { FEEDBACK_EVENTS, FEEDBACK_MESSAGES } from "@shared/feedback";
import { z } from "zod";

const Feedback = z.strictObject({ event: z.enum(FEEDBACK_EVENTS) });

/** Renderer sound already played; notifications belong to the visiting device. */
export function browserFeedback(
  params: Record<string, z.infer<ReturnType<typeof z.json>>>,
  prefs: Prefs,
) {
  const { event } = Feedback.parse(params);
  if (
    prefs.feedback.notifications[event] &&
    "Notification" in globalThis &&
    globalThis.Notification.permission === "granted"
  ) {
    try {
      new globalThis.Notification(FEEDBACK_MESSAGES[event].title, {
        silent: true,
      });
    } catch {
      // Some browsers expose permission without permitting this notification surface.
    }
  }
  return { ok: true };
}
