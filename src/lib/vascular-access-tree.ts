import {
  VASCULAR_PREEXISTING_QUICK_OPTIONS,
  buildOptionTree,
} from "@lospor/core/catalog"
import { vascularAccessDefaultUnit } from "@lospor/core/intraop"

export type VascTreeNode = {
  v: string
  label: string
  children?: VascTreeNode[]
}

type VascularRow = {
  id: string
  value: string
  label: string
  parentId: string | null
}

export function buildVascTree(rows: VascularRow[]): VascTreeNode[] {
  const mapNodes = (
    nodes: ReturnType<typeof buildOptionTree<VascularRow>>,
  ): VascTreeNode[] => nodes.map(node => ({
    v: node.value,
    label: node.label,
    children: node.children?.length ? mapNodes(node.children) : undefined,
  }))
  return mapNodes(buildOptionTree(rows))
}

export const vascDefaultUnit = vascularAccessDefaultUnit

// Color is presentation-only and remains owned by the mobile UI.
export function vascSiteColor(site: string): string {
  if (site.startsWith("ART_")) return "#ef4444"
  if (site === "VEN_PERIPHERAL") return "#22c55e"
  if (site.startsWith("PICC_")) return "#a855f7"
  return "#3b82f6"
}

export const VASC_PREEXISTING_QUICK = VASCULAR_PREEXISTING_QUICK_OPTIONS.map(
  option => ({ v: option.value, label: option.label, crumb: option.crumb }),
)
