// Offline-first local case store.
// When the server cannot be reached during new case creation, the draft is
// saved here with a temporary local ID. The dashboard shows these drafts and
// the flusher syncs them once connectivity is restored.
import * as SecureStore from "expo-secure-store"
import { randomHex } from "@/lib/random-id"

const INDEX_KEY = "lospor_local_case_index"
const caseKey  = (id: string) => `lospor_local_draft_${id}`

function generateLocalId(): string {
  return `local_${randomHex(12)}`
}

export function makeLocalCaseId(): string {
  return generateLocalId()
}

export type LocalCaseDraft = {
  localId: string
  formValues: Record<string, any>
  createdAt: string
}

async function loadIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function storeIndex(ids: string[]): Promise<void> {
  // Throws on SecureStore failure — callers must handle this
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids))
}

/**
 * Persist a local draft. Returns true on success, false on failure.
 * Callers should surface the false return to the user — a silent false means
 * "the user thinks it is saved but it is not".
 */
export async function saveLocalCaseDraft(
  localId: string,
  formValues: Record<string, any>,
): Promise<boolean> {
  const draft: LocalCaseDraft = { localId, formValues, createdAt: new Date().toISOString() }
  try {
    await SecureStore.setItemAsync(caseKey(localId), JSON.stringify(draft))
    const ids = await loadIndex()
    if (!ids.includes(localId)) await storeIndex([...ids, localId])
    return true
  } catch {
    return false
  }
}

export async function loadLocalCaseDraft(localId: string): Promise<LocalCaseDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(caseKey(localId))
    return raw ? (JSON.parse(raw) as LocalCaseDraft) : null
  } catch { return null }
}

export async function deleteLocalCaseDraft(localId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(caseKey(localId))
    const ids = await loadIndex()
    await storeIndex(ids.filter(id => id !== localId))
  } catch {}
}

export async function getAllLocalCaseDrafts(): Promise<LocalCaseDraft[]> {
  const ids = await loadIndex()
  const drafts = await Promise.all(ids.map(id => loadLocalCaseDraft(id)))
  return drafts.filter((d): d is LocalCaseDraft => d !== null)
}
