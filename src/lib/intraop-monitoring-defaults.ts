const GENERAL_TECHNIQUES = new Set(["GENERAL_INHALATION", "GENERAL_TIVA", "GENERAL_COMBINED"])
const NEURAXIAL_TECHNIQUES = new Set(["CSE", "DPE"])
const DEFAULT_MONITORING_LABELS = {
  ecg: "ECG",
  spO2: "SpOв‚‚",
  nbp: "NIBP",
  etco2: "Capnography (EtCOв‚‚)",
  temperature: "Temperature",
  bis: "BIS",
}

type MonitoringOption = { label: string; field: string; section?: string }

export function isGeneralAnesthesiaTechnique(value: string): boolean {
  return GENERAL_TECHNIQUES.has(value)
}

export function isTivaTechnique(value: string): boolean {
  return value === "GENERAL_TIVA"
}

export function isNeuraxialTechnique(value: string): boolean {
  return value.startsWith("SPINAL") || value.startsWith("EPIDURAL") || NEURAXIAL_TECHNIQUES.has(value)
}

export function activeTechniquesForCase(localTechniques: string[], caseTechniques?: string[]): string[] {
  return localTechniques.length > 0 ? localTechniques : (caseTechniques ?? [])
}

export function isGeneralAnesthesiaCase(techniques: string[]): boolean {
  return techniques.some(technique => technique.startsWith("GENERAL") || /ga|ett|lma|tiva/i.test(technique))
}

export function monitoringDefaultLabelsForTechniques(techniques: string[]): string[] {
  const isGA = techniques.some(isGeneralAnesthesiaTechnique)
  const isTIVA = techniques.some(isTivaTechnique)
  const isNeuraxial = techniques.some(isNeuraxialTechnique)

  return [
    ...(isGA || isNeuraxial ? [
      DEFAULT_MONITORING_LABELS.ecg,
      DEFAULT_MONITORING_LABELS.spO2,
      DEFAULT_MONITORING_LABELS.nbp,
      DEFAULT_MONITORING_LABELS.etco2,
    ] : []),
    ...(isGA ? [DEFAULT_MONITORING_LABELS.temperature] : []),
    ...(isTIVA ? [DEFAULT_MONITORING_LABELS.bis] : []),
  ]
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
  const patch: Record<string, boolean> = {}
  for (const option of options) patch[option.field] = selectedLabels.includes(option.label)
  return patch
}

export function selectedMonitoringLabelsFromRecord(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): string[] {
  if (!record) return []
  return options
    .filter(option => !!record[option.field])
    .map(option => option.label)
}

export function hasAdvancedMonitoringSelected(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) return false
  return options.some(option => option.section !== "standard" && !!record[option.field])
}

export function buildTechniqueMonitoringUpdate(
  options: MonitoringOption[],
  currentMonitoring: string[],
  nextTechniques: string[],
): { patch: Record<string, unknown>; monitoring: string[] | null } {
  const patch: Record<string, unknown> = { techniques: nextTechniques }
  let monitoring: string[] | null = null

  const defaults = addMonitoringDefaultsForTechniques(nextTechniques, currentMonitoring)
  if (defaults) {
    Object.assign(patch, buildMonitoringSelectionPatch(options, defaults))
    monitoring = defaults
  }

  const requiredFields = requiredMonitoringFieldsForTechniques(nextTechniques)
  if (requiredFields.length) {
    const byField = new Map(options.map(opt => [opt.field, opt.label]))
    const withRequiredLabels = [...currentMonitoring]
    for (const field of requiredFields) {
      patch[field] = true
      const label = byField.get(field)
      if (label && !withRequiredLabels.includes(label)) withRequiredLabels.push(label)
    }
    monitoring = withRequiredLabels
  }

  return { patch, monitoring }
}

export function requiredMonitoringFieldsForTechniques(techniques: string[]): string[] {
  const isGA = techniques.some(isGeneralAnesthesiaTechnique)
  const isTIVA = techniques.some(isTivaTechnique)
  const isNeuraxial = techniques.some(isNeuraxialTechnique)

  return [
    ...(isGA || isNeuraxial ? ["ecg", "spO2Monitor", "nbpMonitor", "etco2Monitor"] : []),
    ...(isGA ? ["tempMonitor"] : []),
    ...(isTIVA ? ["bis"] : []),
  ]
}
