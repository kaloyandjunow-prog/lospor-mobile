import { View, Text, TouchableOpacity, Alert, Linking } from "react-native"
import { Stack } from "expo-router"
import { useAuth } from "@/lib/auth-context"

export default function SettingsScreen() {
  const { logout } = useAuth()

  function handleLogout() {
    Alert.alert(
      "Sign out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: logout },
      ]
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: "Settings" }} />
      <View className="flex-1 bg-slate-900 px-5 pt-6">

        <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Account
        </Text>

        <View className="bg-slate-800 rounded-xl overflow-hidden mb-6">
          <TouchableOpacity
            className="px-4 py-4 border-b border-slate-700"
            onPress={() => Linking.openURL("https://app.lospor.org/settings")}
          >
            <Text className="text-white text-sm font-medium">Profile &amp; password</Text>
            <Text className="text-slate-400 text-xs mt-0.5">Manage on the web app</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="px-4 py-4 border-b border-slate-700"
            onPress={() => Linking.openURL("https://app.lospor.org/settings")}
          >
            <Text className="text-white text-sm font-medium">Institution &amp; role</Text>
            <Text className="text-slate-400 text-xs mt-0.5">Manage on the web app</Text>
          </TouchableOpacity>

          <TouchableOpacity className="px-4 py-4" onPress={handleLogout}>
            <Text className="text-red-400 text-sm font-medium">Sign out</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3">
          About
        </Text>

        <View className="bg-slate-800 rounded-xl overflow-hidden mb-6">
          <TouchableOpacity
            className="px-4 py-4 border-b border-slate-700"
            onPress={() => Linking.openURL("https://app.lospor.org/privacy")}
          >
            <Text className="text-white text-sm font-medium">Privacy policy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="px-4 py-4"
            onPress={() => Linking.openURL("https://app.lospor.org/terms")}
          >
            <Text className="text-white text-sm font-medium">Terms of use</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-slate-600 text-xs text-center mt-auto mb-6">
          LOSPOR — Large Open Source Perioperative Register
        </Text>
      </View>
    </>
  )
}
