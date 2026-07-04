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
