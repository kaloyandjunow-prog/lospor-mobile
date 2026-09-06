import { useEffect, useState } from "react"
import { AppState } from "react-native"
import {
  parseDeploymentCapabilities,
  safeDeploymentCapabilities,
  type AuthenticationCapabilities,
  type CapabilityReason,
  type ClinicalAiCapabilities,
  type DeploymentCapabilities,
  type PediatricModeCapability,
} from "@lospor/core/deployment-capabilities"
import { apiFetch } from "./api"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"

/**
 * Reading the deployment's declaration is shared logic and lives in core.
 * What is left here is this app's half of it: the bearer-authenticated
 * request, one cache the whole app reads, and a refresh when the phone comes
 * back to the foreground.
 */

export type {
  AuthenticationCapabilities,
  AuthenticationCapabilityStatus,
  CapabilityReason,
  ClinicalAiCapabilities,
  DeploymentCapabilities,
  LoginIdentifier,
  PasswordRecoveryCapability,
  PediatricModeCapability,
  PediatricModeCapabilityReason,
  RuntimeCapability,
} from "@lospor/core/deployment-capabilities"

export type ClinicalAiUnavailableMessageKey =
  | "externalAiDisabledDeployment"
  | "externalAiProviderUnavailable"

export function capabilityMessageKey(
  reason: CapabilityReason,
): ClinicalAiUnavailableMessageKey {
  return reason === "DISABLED_BY_DEPLOYMENT"
    ? "externalAiDisabledDeployment"
    : "externalAiProviderUnavailable"
}

let cached: DeploymentCapabilities | null = null
let loading: Promise<DeploymentCapabilities> | null = null
let authenticationLoading: Promise<AuthenticationCapabilities> | null = null
let clinicalAiLoading: Promise<ClinicalAiCapabilities> | null = null
let pediatricModeLoading: Promise<PediatricModeCapability> | null = null
let cacheEpoch = 0
const CAPABILITY_REFRESH_INTERVAL_MS = 15_000

function loadDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  const epoch = cacheEpoch
  const request = apiFetch("/api/capabilities", { method: "GET" })
    .then(async response => {
      if (!response.ok) return safeDeploymentCapabilities()
      return parseDeploymentCapabilities(
        await response.json().catch(() => null),
        LOSPOR_MOBILE_CLIENT_VERSION,
      )
    })
    .catch(() => safeDeploymentCapabilities())
    .then(result => {
      if (epoch === cacheEpoch) cached = result
      return result
    })
    .finally(() => {
      if (loading === request) loading = null
    })
  loading = request
  return request
}

function refreshDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  cached = null
  if (loading) return loading
  return loadDeploymentCapabilities()
}

export function loadClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (cached) return Promise.resolve(cached.clinicalAi)
  if (clinicalAiLoading) return clinicalAiLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.clinicalAi)
    .finally(() => {
      if (clinicalAiLoading === request) clinicalAiLoading = null
    })
  clinicalAiLoading = request
  return request
}

export function loadAuthenticationCapabilities(): Promise<AuthenticationCapabilities> {
  if (cached) return Promise.resolve(cached.authentication)
  if (authenticationLoading) return authenticationLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.authentication)
    .finally(() => {
      if (authenticationLoading === request) authenticationLoading = null
    })
  authenticationLoading = request
  return request
}

export function loadPediatricModeCapability(): Promise<PediatricModeCapability> {
  if (cached) return Promise.resolve(cached.pediatricMode)
  if (pediatricModeLoading) return pediatricModeLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.pediatricMode)
    .finally(() => {
      if (pediatricModeLoading === request) pediatricModeLoading = null
    })
  pediatricModeLoading = request
  return request
}

export function clearClinicalAiCapabilitiesCache(): void {
  cacheEpoch += 1
  cached = null
  loading = null
  authenticationLoading = null
  clinicalAiLoading = null
  pediatricModeLoading = null
}

export function refreshClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (clinicalAiLoading) return clinicalAiLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.clinicalAi)
    .finally(() => {
      if (clinicalAiLoading === request) clinicalAiLoading = null
    })
  clinicalAiLoading = request
  return request
}

export function refreshAuthenticationCapabilities(): Promise<AuthenticationCapabilities> {
  if (authenticationLoading) return authenticationLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.authentication)
    .finally(() => {
      if (authenticationLoading === request) authenticationLoading = null
    })
  authenticationLoading = request
  return request
}

export function refreshPediatricModeCapability(): Promise<PediatricModeCapability> {
  if (pediatricModeLoading) return pediatricModeLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.pediatricMode)
    .finally(() => {
      if (pediatricModeLoading === request) pediatricModeLoading = null
    })
  pediatricModeLoading = request
  return request
}

export function useDeploymentCapabilities(): DeploymentCapabilities {
  const [capabilities, setCapabilities] = useState(
    () => cached ?? safeDeploymentCapabilities(),
  )
  useEffect(() => {
    let active = true
    let requestSequence = 0
    const apply = (request: Promise<DeploymentCapabilities>) => {
      const sequence = ++requestSequence
      void request.then(value => {
        if (active && sequence === requestSequence) setCapabilities(value)
      })
    }
    const refresh = () => apply(refreshDeploymentCapabilities())

    apply(loadDeploymentCapabilities())
    const interval = setInterval(refresh, CAPABILITY_REFRESH_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState === "active") refresh()
    })

    return () => {
      active = false
      clearInterval(interval)
      subscription.remove()
    }
  }, [])
  return capabilities
}

export function useClinicalAiCapabilities(): ClinicalAiCapabilities {
  return useDeploymentCapabilities().clinicalAi
}

export function useAuthenticationCapabilities(): AuthenticationCapabilities {
  return useDeploymentCapabilities().authentication
}

export function usePediatricModeCapability(): PediatricModeCapability {
  return useDeploymentCapabilities().pediatricMode
}
