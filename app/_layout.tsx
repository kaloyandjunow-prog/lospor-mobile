import "../global.css"
import { Slot, useRouter, useSegments } from "expo-router"
import { useEffect } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"

function Guard() {
  const { state } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (state === "loading") return
    const inAuth = segments[0] === "(auth)"
    if (state === "unauthenticated" && !inAuth) {
      router.replace("/(auth)/login")
    } else if (state === "authenticated" && inAuth) {
      router.replace("/(app)/")
    }
  }, [state, segments])

  return <Slot />
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Guard />
    </AuthProvider>
  )
}
