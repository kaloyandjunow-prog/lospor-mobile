import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native"
import { useAuth } from "@/lib/auth-context"

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password) return
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (err: any) {
      Alert.alert("Login failed", err.message ?? "Please check your credentials.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-bold text-white mb-1">LOSPOR</Text>
        <Text className="text-slate-400 mb-8">Perioperative case log</Text>

        <Text className="text-slate-300 text-sm mb-1">Email</Text>
        <TextInput
          className="bg-slate-800 text-white rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="you@hospital.org"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        <Text className="text-slate-300 text-sm mb-1">Password</Text>
        <TextInput
          className="bg-slate-800 text-white rounded-lg px-4 py-3 mb-6 text-base"
          placeholder="••••••••"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          className="bg-blue-500 rounded-lg py-3.5 items-center"
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text className="text-white font-semibold text-base">Sign in</Text>
          }
        </TouchableOpacity>

        <Text className="text-slate-500 text-xs text-center mt-8">
          Register at app.lospor.org — admin approval required
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}
