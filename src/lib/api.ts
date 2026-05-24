import * as SecureStore from "expo-secure-store"

// Point this at your deployed app or local dev server
export const API_BASE = "https://app.lospor.org"

const TOKEN_KEY = "lospor_access_token"

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await buildHeaders(init?.headers as Record<string, string>)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

// Login — stores the token on success, throws on failure
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Login failed")
  }
  const { access_token } = await res.json()
  await setToken(access_token)
}

export async function logout(): Promise<void> {
  await clearToken()
}
