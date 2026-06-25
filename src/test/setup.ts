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
    Pressable: host("Pressable"),
    Switch: host("Switch"),
    Text: host("Text"),
    TextInput: host("TextInput"),
    TouchableOpacity: host("TouchableOpacity"),
    View: host("View"),
  }
})
