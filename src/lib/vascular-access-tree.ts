export type VascTreeNode = { v: string; label: string; children?: VascTreeNode[] }

// Builds the tree from the shared OptionLibrary VASCULAR_ACCESS category —
// this used to be a hardcoded literal here, identical in content to web's
// VascularAccessTree.tsx but maintained as a second, independent copy. If
// someone edited lospor-app's src/data/option-library/vascular-access.ts and
// reseeded, web would pick it up automatically and mobile would silently
// keep showing the old tree — the same drift risk the OptionLibrary
// migration fixed for every other category (technique, drugs, monitoring,
// etc.) except this one, which got missed. Mirrors buildTechniqueTree in
// app/(app)/cases/intraop/[id].tsx.
export function buildVascTree(rows: { id: string; value: string; label: string; parentId: string | null }[]): VascTreeNode[] {
  const byParent = new Map<string | null, typeof rows>()
  for (const r of rows) {
    const key = r.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(r)
  }
  function build(parentId: string | null): VascTreeNode[] {
    return (byParent.get(parentId) ?? []).map(r => ({
      v: r.value,
      label: r.label,
      children: byParent.has(r.id) ? build(r.id) : undefined,
    }))
  }
  return build(null)
}

export function vascDefaultUnit(site: string) {
  return site.startsWith("ART_") || site === "VEN_PERIPHERAL" ? "G" : "Fr"
}

export function vascSiteColor(site: string): string {
  if (site.startsWith("ART_")) return "#ef4444"
  if (site === "VEN_PERIPHERAL") return "#22c55e"
  if (site.startsWith("PICC_")) return "#a855f7"
  return "#3b82f6"
}

export const VASC_PREEXISTING_QUICK = [
  { v:"VEN_PERIPHERAL", label:"Peripheral IV",    crumb:"Venous › Peripheral IV" },
  { v:"CVK_IJV",        label:"CVC (IJV)",         crumb:"Venous › Central › Central line › Internal jugular" },
  { v:"CVK_SUBCLAVIAN", label:"CVC (Subclavian)",  crumb:"Venous › Central › Central line › Subclavian" },
  { v:"ART_RADIAL",     label:"Art line (Radial)", crumb:"Arterial › Radial" },
]
