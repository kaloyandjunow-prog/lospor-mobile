import { Link, Stack } from "expo-router"
import { View, Text } from "react-native"

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 bg-slate-900 justify-center items-center px-6">
        <Text className="text-white text-xl font-bold mb-2">Page not found</Text>
        <Text className="text-slate-400 text-sm text-center mb-6">
          This screen doesn't exist.
        </Text>
        <Link href="/(app)" className="text-blue-400 text-base">
          Go to dashboard
        </Link>
      </View>
    </>
  )
}
