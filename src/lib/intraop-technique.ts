import type { LibraryOption } from "@/lib/use-option-library"

// Anaesthesia-technique tree + presentation helpers, built from the
// OptionLibrary TECHNIQUE category (web's value codes — keeps mobile/web in
// sync). Pure + testable.

export type TechniqueNode = { v: string; label: string; isOther?: boolean; children?: TechniqueNode[] }

// Grouping nodes that add no clinical value in a compact pill label.
export const TECH_SKIP_LABELS = new Set([
  "Peripheral nerve block", "Upper extremity", "Lower extremity",
  "Trunk / Abdominal wall", "Head & Neck", "Ophthalmic", "Single shot",
])
export const TECH_ROOT_SHORT: Record<string, string> = {
  "General anaesthesia": "General",
  "Regional anaesthesia": "Regional",
  "Sedation / MAC": "Sedation",
  "Local infiltration": "Local infiltration",
}

export function buildTechniqueTree(rows: LibraryOption[]): TechniqueNode[] {
  const byParent = new Map<string | null, LibraryOption[]>()
  for (const r of rows) {
    const key = r.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(r)
  }
  function build(parentId: string | null): TechniqueNode[] {
    return (byParent.get(parentId) ?? []).map(r => ({
      v: r.value,
      label: r.label,
      children: byParent.has(r.id) ? build(r.id) : undefined,
    }))
  }
  return build(null)
}

export function techniqueValuePath(
  value: string,
  nodes: TechniqueNode[],
  trail: string[] = [],
): string[] | undefined {
  for (const node of nodes) {
    const next = [...trail, node.label]
    if (node.v === value) return next
    if (node.children) {
      const found = techniqueValuePath(value, node.children, next)
      if (found) return found
    }
  }
}

// Category-aware label: e.g. "General Inhalational", "Regional Femoral nerve",
// "Regional Neuraxial Epidural Lumbar". Mirrors the web display.
export function techniqueDisplayLabel(value: string, tree: TechniqueNode[]): string {
  if (value.startsWith("OTHER:")) return value.slice(6)
  const path = techniqueValuePath(value, tree)
  if (!path || path.length === 0) return value
  const parts = path
    .map((label, index) => (index === 0 ? (TECH_ROOT_SHORT[label] ?? label) : label))
    .filter(label => !TECH_SKIP_LABELS.has(label))
    .map(label => label.replace(" (SAB)", ""))
  const out: string[] = []
  for (const part of parts) if (out[out.length - 1] !== part) out.push(part)
  return out.join(" ")
}

export function techniqueColor(v: string): string {
  if (v.startsWith("GENERAL"))  return "#8b5cf6"
  if (v.startsWith("SPINAL") || v.startsWith("EPIDURAL") || v.startsWith("CSE") || v === "DPE") return "#3b82f6"
  if (v.startsWith("BLOCK"))    return "#22c55e"
  if (v.startsWith("SEDATION")) return "#f59e0b"
  if (v === "LOCAL")            return "#f43f5e"
  return "#64748b"
}
