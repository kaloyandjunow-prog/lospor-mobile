// Offline-first local case store.
// When the server cannot be reached during new case creation, the draft is
// saved here with a temporary local ID. The dashboard shows these drafts and
// the flusher syncs them once connectivity is restored.
//
// Drafts live in the app's private document directory, not SecureStore.
// SecureStore is backed by Android's keystore and is meant for small secrets —
// its practical per-item ceiling is around 2 KB, and a filled-in preoperative
// draft is comfortably larger than that. Writes were failing on Android, and
// while `saveLocalCaseDraft` correctly returned false, the effect was that
// offline drafts simply did not work on the platform most clinicians use.
//
// A draft is clinical working data, not a credential: it holds no patient
// identifiers and never leaves the device's sandboxed storage. The auth token
// stays in SecureStore, which is what that API is for.
import * as FileSystem from "expo-file-system/legacy"
import { randomHex } from "@/lib/random-id"

const DIR = `${FileSystem.documentDirectory}case-drafts/`
const draftPath = (id: string) => `${DIR}${id}.json`

function generateLocalId(): string {
  return `local_${randomHex(12)}`
}

export function makeLocalCaseId(): string {
  return generateLocalId()
}

export type LocalCaseDraft = {
  localId: string
  formValues: Record<string, unknown>
  createdAt: string
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true })
}

/**
 * Persist a local draft. Returns true on success, false on failure.
 * Callers should surface the false return to the user — a silent false means
 * "the user thinks it is saved but it is not".
 */
export async function saveLocalCaseDraft(
  localId: string,
  formValues: Record<string, unknown>,
): Promise<boolean> {
  const draft: LocalCaseDraft = { localId, formValues, createdAt: new Date().toISOString() }
  try {
    await ensureDir()
    await FileSystem.writeAsStringAsync(draftPath(localId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export async function loadLocalCaseDraft(localId: string): Promise<LocalCaseDraft | null> {
  try {
    const info = await FileSystem.getInfoAsync(draftPath(localId))
    if (!info.exists) return null
    const raw = await FileSystem.readAsStringAsync(draftPath(localId))
    return raw ? (JSON.parse(raw) as LocalCaseDraft) : null
  } catch { return null }
}

export async function deleteLocalCaseDraft(localId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(draftPath(localId), { idempotent: true })
  } catch {}
}

/** The directory listing is the index — no separate index file to fall out of step. */
async function listDraftIds(): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(DIR)
    if (!info.exists) return []
    const files = await FileSystem.readDirectoryAsync(DIR)
    return files.filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, ""))
  } catch { return [] }
}

export async function getAllLocalCaseDrafts(): Promise<LocalCaseDraft[]> {
  const ids = await listDraftIds()
  const drafts = await Promise.all(ids.map(id => loadLocalCaseDraft(id)))
  return drafts.filter((d): d is LocalCaseDraft => d !== null)
}

export async function clearAllLocalCaseDrafts(): Promise<number> {
  const ids = await listDraftIds()
  await Promise.all(ids.map(id => FileSystem.deleteAsync(draftPath(id), { idempotent: true }).catch(() => {})))
  return ids.length
}
