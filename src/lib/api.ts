import * as SecureStore from "expo-secure-store"

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://app.lospor.org").replace(/\/$/, "")

const TOKEN_KEY = "lospor_access_token"
const LAST_OK_KEY = "lospor_last_ok_request"
const LAST_ERROR_KEY = "lospor_last_api_error"
const authExpiredListeners = new Set<() => void>()

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
    this.name = "ApiError"
  }
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export function onAuthExpired(listener: () => void): () => void {
  authExpiredListeners.add(listener)
  return () => authExpiredListeners.delete(listener)
}

// Debounce gate: if multiple concurrent requests hit 401 simultaneously only
// one auth-expired event fires. Resets after 2 seconds.
let authExpiredFiredAt = 0
async function handleUnauthorized() {
  const now = Date.now()
  if (now - authExpiredFiredAt < 2000) return
  authExpiredFiredAt = now
  await clearToken()
  authExpiredListeners.forEach((listener) => listener())
}

export async function getLastOkRequest(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_OK_KEY)
}

export async function getLastApiError(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_ERROR_KEY)
}

export function decodeTokenPayload(token: string | null): Record<string, any> | null {
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=")
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")))
  } catch {
    return null
  }
}

export function isTokenExpired(token: string | null): boolean {
  const payload = decodeTokenPayload(token)
  if (!payload?.exp) return false
  return Date.now() >= Number(payload.exp) * 1000
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
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
    if (res.ok) {
      await SecureStore.setItemAsync(LAST_OK_KEY, new Date().toISOString())
    } else {
      await SecureStore.setItemAsync(LAST_ERROR_KEY, `${res.status} ${path}`)
      if (res.status === 401) await handleUnauthorized()
    }
    return res
  } catch (err) {
    await SecureStore.setItemAsync(LAST_ERROR_KEY, `Network error ${path}`)
    throw err
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, init)
  } catch {
    throw new ApiError(`Cannot reach server at ${API_BASE}.`, 0, "NETWORK")
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const fallback =
      res.status === 401 ? "Session expired. Please sign in again."
      : res.status === 403 ? "You do not have access to this item."
      : res.status === 404 ? "This item was not found."
      : `Request failed (${res.status}).`
    throw new ApiError(body.error ?? fallback, res.status)
  }

  return res.json()
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
    if (res.status === 401) {
      const check = await fetch(`${API_BASE}/api/auth/check-pending?email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .catch(() => ({ pending: false }))
      if (check.pending) {
        throw new Error("Your account is awaiting admin approval. You'll be able to sign in once an administrator approves it.")
      }
    }
    throw new Error(body.error ?? "Login failed")
  }
  const { access_token } = await res.json()
  await setToken(access_token)
}

export async function logout(): Promise<void> {
  await clearToken()
}
