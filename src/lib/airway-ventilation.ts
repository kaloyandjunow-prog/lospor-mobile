export const CL_GRADES = [
  { code:"I",   color:"#22c55e" },
  { code:"IIa", color:"#84cc16" },
  { code:"IIb", color:"#eab308" },
  { code:"III", color:"#f97316" },
  { code:"IV",  color:"#ef4444" },
]

export const AIRWAY_HAS_SUBOPTIONS = ["LMA","ORAL_ETT","NASAL_ETT","DOUBLE_LUMEN_TUBE","ENDOBRONCHIAL_TUBE"]

export const VENT_ASSISTED = [
  { v: "A/C",      label: "Assist/Control (A/C)" },
  { v: "PSV",      label: "Pressure Support (PSV)" },
  { v: "BiPAP",    label: "BiPAP" },
  { v: "CPAP",     label: "CPAP" },
  { v: "SIMV+PSV", label: "SIMV + PSV" },
  { v: "PAV",      label: "Proportional Assist (PAV)" },
]
export const VENT_CONTROLLED = [
  { v: "VCV",  label: "Volume Control (VCV)" },
  { v: "PCV",  label: "Pressure Control (PCV)" },
  { v: "PRVC", label: "PRVC / VCRP" },
  { v: "APRV", label: "APRV / BiLevel" },
  { v: "HFOV", label: "HFOV" },
  { v: "VG",   label: "Volume Guarantee (VG)" },
]

export type VentilationPanel = "assisted" | "controlled" | null

export function expandedVentilationPanelForModes(modes: string[]): VentilationPanel {
  if (VENT_ASSISTED.some(mode => modes.includes(mode.v))) return "assisted"
  if (VENT_CONTROLLED.some(mode => modes.includes(mode.v))) return "controlled"
  return null
}
