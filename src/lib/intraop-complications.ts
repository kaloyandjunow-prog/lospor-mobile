// Round-trips the intraop complications field between the UI representation
// (selected items + free-text notes) and its stored "a; b — notes" string.
// Pure + tested; extracted from the intraop screen.

export function formatComplications(selected: string[], notes: string): string | null {
  const comps = selected.join("; ")
  const n = notes.trim().slice(0, 500)
  if (comps && n) return `${comps} — ${n}`
  if (comps) return comps
  if (n) return n
  return null
}

export function addComplicationLabel(selected: string[], label: string): string[] | null {
  if (selected.includes(label)) return null
  return [...selected, label]
}

export function toggleComplicationLabel(selected: string[], label: string): string[] {
  return selected.includes(label)
    ? selected.filter(item => item !== label)
    : [...selected, label]
}

export function parseComplications(raw: string, knownItems: string[]): { selected: string[]; notes: string } {
  const dashIdx = raw.indexOf(" — ")
  if (dashIdx !== -1) {
    return { selected: raw.slice(0, dashIdx).split("; ").filter(Boolean), notes: raw.slice(dashIdx + 3) }
  }
  // No separator: either a pure list of known complications, or free-text notes.
  const parts = raw.split("; ").filter(Boolean)
  const allKnown = parts.length > 0 && parts.every(p => knownItems.includes(p))
  return allKnown ? { selected: parts, notes: "" } : { selected: [], notes: raw }
}
