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
    // Minimal Animated/PanResponder so components using FeedbackPressable or
    // the VitalStepper slider render under the shim (no real animation).
    Animated: {
      View: host("Animated.View"),
      createAnimatedComponent: (c: unknown) => c,
      Value: class {
        constructor(public _v: number) {}
        setValue() {}
        interpolate() { return this }
      },
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      spring: () => ({ start: (cb?: () => void) => cb?.() }),
      sequence: () => ({ start: (cb?: () => void) => cb?.() }),
      parallel: () => ({ start: (cb?: () => void) => cb?.() }),
    },
    PanResponder: { create: () => ({ panHandlers: {} }) },
  }
})

// expo-secure-store pulls in expo-modules-core, which references the RN
// __DEV__ global that isn't defined outside the RN runtime. Components under
// test only need PreferencesProvider's language persistence to no-op.
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}))
