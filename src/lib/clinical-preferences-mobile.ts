import * as SecureStore from "expo-secure-store"
import { apiFetch, apiJson, decodeTokenPayload, getToken } from "@/lib/api"
import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
  parseClinicalPreferencesPatch,
  type ClinicalPreferences,
  type ClinicalPreferencesPatch,
} from "@lospor/core/clinical-preferences"

const SNAPSHOT_KEY = "lospor_clinical_preferences_v1"
const DIRTY_KEY = "lospor_clinical_preferences_dirty_v1"

const LEGACY_KEYS = {
  height: "lospor_height_unit",
  weight: "lospor_weight_unit",
  temperature: "lospor_temperature_unit",
  etco2: "lospor_etco2_unit",
  autoFillVitals: "intraop_autofill_vitals",
  autoFillBP: "intraop_autofill_bp",
  autoFillBg: "intraop_autofill_bg",
  preopLayout: "lospor_preop_layout",
  postopLayout: "lospor_postop_layout",
} as const

let serverPreferencesRevision: number | null = null

type UserPreferencesResponse = {
  preferences?: unknown
  preferencesRevision?: unknown
}

function parsePendingPatch(
  value: string | null,
): ClinicalPreferencesPatch | null {
  if (!value || value === "true") return null
  try {
    return combineClinicalPreferencesPatches(JSON.parse(value))
  } catch {
    return null
  }
}

async function writePendingPatch(
  patch: ClinicalPreferencesPatch,
): Promise<void> {
  const current = parsePendingPatch(
    await SecureStore.getItemAsync(DIRTY_KEY).catch(() => null),
  )
  const pending = combineClinicalPreferencesPatches(current, patch)
  await SecureStore.setItemAsync(DIRTY_KEY, JSON.stringify(pending))
}

/**
 * The account a device snapshot belongs to.
 *
 * Preferences are per-account on the server, but the device copy lived under a
 * single un-namespaced key and survived sign-out. On a shared phone or tablet
 * that meant the next clinician to sign in read the previous one's snapshot,
 * and — because a field absent from the server falls back to the device value
 * and is then pushed back up — inherited their favourite drugs and infusions
 * into their own account, permanently and silently.
 *
 * Stamping the snapshot with its owner closes that without depending on a clean
 * sign-out, which is what a session that simply expires never performs.
 */
async function currentAccountId(): Promise<string | null> {
  const payload = decodeTokenPayload(await getToken().catch(() => null))
  if (!payload) return null
  const id = payload.sub ?? payload.userId ?? payload.id
  return typeof id === "string" && id ? id : null
}

type StoredSnapshot = {
  owner: string | null
  preferences: ClinicalPreferences
  patch: ClinicalPreferencesPatch
}

function parseSnapshot(value: string | null): StoredSnapshot | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === "object" && "owner" in parsed && "preferences" in parsed) {
      const record = parsed as { owner: unknown; preferences: unknown }
      return {
        owner: typeof record.owner === "string" ? record.owner : null,
        preferences: normalizeClinicalPreferences(record.preferences),
        patch: parseClinicalPreferencesPatch(record.preferences),
      }
    }
    // Written before snapshots carried an owner. There is no way to tell whose
    // it is, so it is treated as belonging to nobody and discarded rather than
    // adopted — the server copy is authoritative and restores it on next sync.
    return {
      owner: null,
      preferences: normalizeClinicalPreferences(parsed),
      patch: parseClinicalPreferencesPatch(parsed),
    }
  } catch {
    return null
  }
}

async function clearLegacyPreferenceKeys(): Promise<void> {
  await Promise.all(
    Object.values(LEGACY_KEYS).map(key =>
      SecureStore.deleteItemAsync(key).catch(() => {})),
  )
}

export async function readMobileClinicalPreferences(): Promise<ClinicalPreferences> {
  return normalizeClinicalPreferences(await readMobileStoredPatch())
}

async function readMobileStoredPatch(): Promise<ClinicalPreferencesPatch> {
  const snapshot = parseSnapshot(
    await SecureStore.getItemAsync(SNAPSHOT_KEY).catch(() => null),
  )
  if (!snapshot) {
    // These keys predate owner-stamped snapshots and cannot safely be
    // attributed after a sign-out or token expiry. The server account is the
    // authority; discard the unowned device copy rather than leaking it into
    // the next account during the first sync.
    await clearLegacyPreferenceKeys()
    return {}
  }

  const account = await currentAccountId()
  if (snapshot.owner === null || snapshot.owner !== account) {
    // Someone else's device copy, or one from before owners were recorded. Drop
    // it — including the legacy per-setting keys, which are just as unowned —
    // and start from defaults until the server copy arrives.
    await clearMobileClinicalPreferences()
    return {}
  }
  await clearLegacyPreferenceKeys()
  return snapshot.patch
}

/** Removes every device copy of the signed-in account's preferences. */
export async function clearMobileClinicalPreferences(): Promise<void> {
  serverPreferencesRevision = null
  await Promise.all([
    SecureStore.deleteItemAsync(SNAPSHOT_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(DIRTY_KEY).catch(() => {}),
    clearLegacyPreferenceKeys(),
  ])
}

export async function writeMobileClinicalPreferences(
  preferences: ClinicalPreferences,
): Promise<void> {
  const normalized = normalizeClinicalPreferences(preferences)
  const owner = await currentAccountId()
  await Promise.all([
    SecureStore.setItemAsync(SNAPSHOT_KEY, JSON.stringify({ owner, preferences: normalized })),
    SecureStore.setItemAsync(LEGACY_KEYS.height, normalized.units.height),
    SecureStore.setItemAsync(LEGACY_KEYS.weight, normalized.units.weight),
    SecureStore.setItemAsync(
      LEGACY_KEYS.temperature,
      normalized.units.temperature,
    ),
    SecureStore.setItemAsync(LEGACY_KEYS.etco2, normalized.units.etco2),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillVitals,
      normalized.autoFillVitals.enabled ? "on" : "off",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillBP,
      normalized.autoFillVitals.includeBloodPressure ? "on" : "off",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillBg,
      normalized.autoFillVitals.backfillOnReopen ? "on" : "off",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.preopLayout,
      normalized.caseLayout.preop === "tabs" ? "sections" : "scroll",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.postopLayout,
      normalized.caseLayout.postop === "tabs" ? "sections" : "scroll",
    ),
  ])
}

async function pushPreferences(
  preferences: ClinicalPreferences | ClinicalPreferencesPatch,
  retryOnConflict = true,
): Promise<boolean> {
  try {
    const response = await apiFetch("/api/user", {
      method: "PATCH",
      body: JSON.stringify({
        preferences,
        ...(serverPreferencesRevision != null
          ? { preferencesRevision: serverPreferencesRevision }
          : {}),
      }),
    })
    const data = await response.json().catch(() => null) as { preferencesRevision?: unknown } | null
    if (typeof data?.preferencesRevision === "number"
      && Number.isInteger(data.preferencesRevision)
      && data.preferencesRevision >= 0) {
      serverPreferencesRevision = data.preferencesRevision
    }
    if (response.status === 409 && retryOnConflict
      && typeof data?.preferencesRevision === "number") {
      return pushPreferences(preferences, false)
    }
    if (!response.ok) return false
    await SecureStore.deleteItemAsync(DIRTY_KEY).catch(() => {})
    return true
  } catch {
    return false
  }
}

export async function syncMobileClinicalPreferences(): Promise<ClinicalPreferences> {
  const localPatch = await readMobileStoredPatch()
  const local = normalizeClinicalPreferences(localPatch)
  const dirtyRaw = await SecureStore.getItemAsync(DIRTY_KEY).catch(() => null)
  const pending = parsePendingPatch(dirtyRaw)
  try {
    const server = await apiJson<UserPreferencesResponse>("/api/user")
    if (typeof server.preferencesRevision === "number"
      && Number.isInteger(server.preferencesRevision)
      && server.preferencesRevision >= 0) {
      serverPreferencesRevision = server.preferencesRevision
    }
    const localIntent = dirtyRaw === "true" ? localPatch : pending
    const merged = localIntent
      ? applyClinicalPreferencesPatch(
          mergeClinicalPreferences(server.preferences, {}),
          localIntent,
        )
      : mergeClinicalPreferences(server.preferences, {})
    await writeMobileClinicalPreferences(merged)
    if (localIntent && !await pushPreferences(pending ?? localPatch, dirtyRaw !== "true")) {
      if (!dirtyRaw) await writePendingPatch(merged)
    }
    return merged
  } catch {
    return local
  }
}

export async function patchMobileClinicalPreferences(
  current: ClinicalPreferences,
  patch: ClinicalPreferencesPatch,
): Promise<ClinicalPreferences> {
  const next = applyClinicalPreferencesPatch(current, patch)
  await writeMobileClinicalPreferences(next)
  await writePendingPatch(patch)
  if (await pushPreferences(patch)) {
    await SecureStore.deleteItemAsync(DIRTY_KEY).catch(() => {})
  }
  return next
}
