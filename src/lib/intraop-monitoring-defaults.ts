import { MONITORING } from "@lospor/core/catalog"
import {
  isGeneralAnesthesiaCase,
  isGeneralAnesthesiaTechnique,
  isNeuraxialTechnique,
  isTivaTechnique,
  requiredMonitoringFieldsForTechniques,
} from "@lospor/core/intraop"

export {
  isGeneralAnesthesiaCase,
  isGeneralAnesthesiaTechnique,
  isNeuraxialTechnique,
  isTivaTechnique,
  requiredMonitoringFieldsForTechniques,
}

type MonitoringOption = { label: string; field: string; section?: string }

const canonicalLabelByField = new Map(
  MONITORING.map(option => [option.field, option.label]),
)

export function activeTechniquesForCase(
  localTechniques: string[],
  caseTechniques?: string[],
): string[] {
  return localTechniques.length > 0 ? localTechniques : (caseTechniques ?? [])
}

export function monitoringDefaultLabelsForTechniques(techniques: string[]): string[] {
  return requiredMonitoringFieldsForTechniques(techniques).flatMap(field => {
    const label = canonicalLabelByField.get(field)
    return label ? [label] : []
  })
}

export function addMonitoringDefaultsForTechniques(
  techniques: string[],
  currentMonitoring: string[],
): string[] | null {
  const next = [...currentMonitoring]
  for (const label of monitoringDefaultLabelsForTechniques(techniques)) {
    if (!next.includes(label)) next.push(label)
  }
  return next.length > currentMonitoring.length ? next : null
}

export function buildMonitoringSelectionPatch(
  options: MonitoringOption[],
  selectedLabels: string[],
): Record<string, boolean> {
  return Object.fromEntries(
    options.map(option => [option.field, selectedLabels.includes(option.label)]),
  )
}

export function selectedMonitoringLabelsFromRecord(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): string[] {
  if (!record) return []
  return options
    .filter(option => Boolean(record[option.field]))
    .map(option => option.label)
}

export function hasAdvancedMonitoringSelected(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) return false
  return options.some(option =>
    option.section !== "standard" && Boolean(record[option.field]),
  )
}

export function buildTechniqueMonitoringUpdate(
  options: MonitoringOption[],
  currentMonitoring: string[],
  nextTechniques: string[],
): { patch: Record<string, unknown>; monitoring: string[] | null } {
  const patch: Record<string, unknown> = { techniques: nextTechniques }
  const requiredFields = requiredMonitoringFieldsForTechniques(nextTechniques)
  if (!requiredFields.length) return { patch, monitoring: null }

  const labelsByField = new Map(options.map(option => [option.field, option.label]))
  const monitoring = [...currentMonitoring]
  for (const field of requiredFields) {
    patch[field] = true
    const label = labelsByField.get(field)
    if (label && !monitoring.includes(label)) monitoring.push(label)
  }
  return {
    patch,
    monitoring: monitoring.length > currentMonitoring.length ? monitoring : null,
  }
}
