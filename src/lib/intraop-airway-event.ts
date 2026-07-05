type AirwayEventDetail = {
  tubeSize: string
  cuffed: "" | "yes" | "no"
  tool: string
  cl?: string
}

export function formatAirwayEventLabel(airwayLabel: string, detail: AirwayEventDetail): string {
  const suffix = airwayLabel === "Intubated"
    ? `${detail.tubeSize}mm ${detail.cuffed === "yes" ? "cuffed" : "uncuffed"} · ${detail.tool}${detail.cl ? ` · CL ${detail.cl}` : ""}`
    : `LMA ${detail.tubeSize}`
  return `${airwayLabel} (${suffix})`
}
