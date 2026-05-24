import React, { createContext, useContext, useEffect, useState } from "react"
import { getToken, login as apiLogin, logout as apiLogout } from "./api"

type AuthState = "loading" | "unauthenticated" | "authenticated"

type AuthContextValue = {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading")

  useEffect(() => {
    getToken().then(token => {
      setState(token ? "authenticated" : "unauthenticated")
    })
  }, [])

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    setState("authenticated")
  }

  async function logout() {
    await apiLogout()
    setState("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
