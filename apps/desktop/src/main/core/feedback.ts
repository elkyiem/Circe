import { Notification, shell } from "electron";
import { FEEDBACK_MESSAGES, type FeedbackEvent } from "../../shared/feedback";
import { getPrefs } from "./prefs";

interface FeedbackServicePorts {
  beep(): void;
  getPreferences(): Promise<{
    masterSound: boolean;
    sounds: Partial<Record<FeedbackEvent, boolean>>;
    notifications: Record<FeedbackEvent, boolean>;
  }>;
  notificationsSupported(): boolean;
  showNotification(title: string): void;
}

export function createFeedbackService(ports: FeedbackServicePorts) {
  return {
    async emit(
      event: FeedbackEvent,
      options: { sound?: boolean } = {},
    ): Promise<void> {
      const preferences = await ports.getPreferences();
      if (
        options.sound !== false &&
        preferences.masterSound &&
        preferences.sounds[event]
      ) {
        ports.beep();
      }
      if (
        !preferences.notifications[event] ||
        !ports.notificationsSupported()
      ) {
        return;
      }
      ports.showNotification(FEEDBACK_MESSAGES[event].title);
    },
  };
}

const service = createFeedbackService({
  beep: () => shell.beep(),
  async getPreferences() {
    const prefs = await getPrefs();
    return {
      masterSound: prefs.preferences.soundsEnabled,
      sounds: prefs.feedback.sounds,
      notifications: prefs.feedback.notifications,
    };
  },
  notificationsSupported: () => Notification.isSupported(),
  showNotification: (title) => new Notification({ title, silent: true }).show(),
});

export function emitFeedback(event: FeedbackEvent): Promise<void> {
  return service.emit(event);
}

export function emitRendererFeedback(event: FeedbackEvent): Promise<void> {
  return service.emit(event, { sound: false });
}

export async function openNotificationSettings(): Promise<boolean> {
  const url = notificationSettingsUrl(process.platform);
  if (!url) return false;
  await shell.openExternal(url);
  return true;
}

export function notificationSettingsUrl(
  platform: NodeJS.Platform,
): string | null {
  if (platform === "darwin")
    return "x-apple.systempreferences:com.apple.Notifications-Settings.extension";
  if (platform === "win32") return "ms-settings:notifications";
  return null;
}
