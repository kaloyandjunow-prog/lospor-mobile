import { Alert, Platform } from "react-native"

// react-native-web ships an Alert whose `.alert()` is an empty no-op
// (class Alert { static alert() {} }). Any validation/error message routed
// through Alert.alert is therefore completely invisible on the PWA, which made
// the preop "Continue" gate fail silently. This helper falls back to the
// browser's native window.alert on web so the user actually sees the message.
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(text)
    }
    return
  }
  Alert.alert(title, message)
}
