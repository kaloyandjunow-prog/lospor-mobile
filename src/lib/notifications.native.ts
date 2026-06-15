// Native (iOS/Android) notifications via expo-notifications. Metro resolves this
// file on device in preference to notifications.ts. Same interface as the web file.
import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

export type ReminderHandle = string | number | null
export type NotifPermission = "granted" | "denied" | "default" | "unsupported"
export type NotifStatus = { supported: boolean; permission: NotifPermission; reason?: string }

const CHANNEL_ID = "reminders"

export async function getStatus(): Promise<NotifStatus> {
  try {
    const p = await Notifications.getPermissionsAsync()
    return {
      supported: true,
      permission: p.granted ? "granted" : p.canAskAgain ? "default" : "denied",
    }
  } catch {
    return { supported: false, permission: "unsupported", reason: "Notifications need a rebuilt app — update to the latest build." }
  }
}

// Show notifications while the app is foregrounded, and create the Android channel.
// Safe to call once at startup.
export function configureForeground(): void {
  // Guard the whole setup: if this JS is ever loaded by a dev client built before
  // expo-notifications was added, the native module is missing — degrade to
  // "no notifications" instead of crashing at startup.
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Case reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      }).catch(() => {})
    }
  } catch {
    /* native module unavailable (old dev client) — notifications stay off */
  }
}

export async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    })
    return res.granted
  } catch {
    return false
  }
}

export async function presentNow(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  })
}

export async function scheduleRepeating(title: string, body: string, intervalMinutes: number): Promise<ReminderHandle> {
  // iOS requires a repeating interval of at least 60s.
  const seconds = Math.max(60, Math.round(intervalMinutes * 60))
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: true,
      channelId: CHANNEL_ID,
    },
  })
}

export async function cancelReminder(handle: ReminderHandle): Promise<void> {
  if (typeof handle === "string") {
    try { await Notifications.cancelScheduledNotificationAsync(handle) } catch { /* already gone */ }
  }
}
