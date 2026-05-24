import { Stack } from "expo-router"

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1e293b" },
        headerTintColor: "#f1f5f9",
        headerTitleStyle: { fontWeight: "600" },
      }}
    />
  )
}
