import React from "react"
import { vi } from "vitest"

function host(name: string) {
  return function Host({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) {
    return React.createElement(name, props, children)
  }
}

vi.mock("react-native", () => {
  return {
    ActivityIndicator: host("ActivityIndicator"),
    KeyboardAvoidingView: host("KeyboardAvoidingView"),
    Modal: host("Modal"),
    Pressable: host("Pressable"),
    ScrollView: host("ScrollView"),
    Switch: host("Switch"),
    Text: host("Text"),
    TextInput: host("TextInput"),
    TouchableOpacity: host("TouchableOpacity"),
    View: host("View"),
    // Mutable so tests can flip OS to exercise web vs native dialog paths.
    Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.native ?? o.default },
    Alert: { alert: vi.fn() },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  }
})

// expo-secure-store pulls in expo-modules-core, which references the RN
// __DEV__ global that isn't defined outside the RN runtime. Components under
// test only need PreferencesProvider's language persistence to no-op.
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}))
