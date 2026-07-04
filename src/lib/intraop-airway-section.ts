type BuildAirwaySectionPatchInput = {
  awTools: string[]
  awDevices: string[]
  awLmaSize: string | null
  awOralTubeSize: string | null
  awOralCuffed: boolean | null
  awNasalTubeSize: string | null
  awNasalCuffed: boolean | null
  awDltType: string | null
  awDltSide: string | null
  awDltSize: number | null
  awEbSize: number | null
  awClGrade: string
  awVentModes: string[]
  awNotes: string
}

export type AirwayDeviceCompletenessInput = {
  awLmaSize: string | null
  awOralTubeSize: string | null
  awOralCuffed: boolean | null
  awNasalTubeSize: string | null
  awNasalCuffed: boolean | null
  awDltType: string | null
  awDltSide: string | null
  awDltSize: number | null
  awEbSize: number | null
}

export function isAirwayDeviceComplete(
  device: string,
  input: AirwayDeviceCompletenessInput,
): boolean {
  switch (device) {
    case "LMA":
      return input.awLmaSize != null
    case "ORAL_ETT":
      return input.awOralTubeSize != null && input.awOralCuffed != null
    case "NASAL_ETT":
      return input.awNasalTubeSize != null && input.awNasalCuffed != null
    case "DOUBLE_LUMEN_TUBE":
      return input.awDltType != null && input.awDltSide != null && input.awDltSize != null
    case "ENDOBRONCHIAL_TUBE":
      return input.awEbSize != null
    default:
      return false
  }
}

export function syncAirwayDeviceSelection(devices: string[], device: string, complete: boolean): string[] {
  const included = devices.includes(device)
  if (complete && !included) return [...devices, device]
  if (!complete && included) return devices.filter(item => item !== device)
  return devices
}

export function buildAirwaySectionPatch(input: BuildAirwaySectionPatchInput): Record<string, unknown> {
  return {
    airwayTools: input.awTools,
    airwayDevices: input.awDevices,
    lmaSize: input.awLmaSize != null ? Number(input.awLmaSize) : null,
    oralTubeSize: input.awOralTubeSize != null ? Number(input.awOralTubeSize) : null,
    oralCuffed: input.awOralCuffed,
    nasalTubeSize: input.awNasalTubeSize != null ? Number(input.awNasalTubeSize) : null,
    nasalCuffed: input.awNasalCuffed,
    dltType: input.awDltType,
    dltSide: input.awDltSide,
    dltSize: input.awDltSize,
    endobronchialSize: input.awEbSize,
    cormackLehane: input.awClGrade || null,
    ventilationModes: input.awVentModes,
    airwayNotes: input.awNotes,
  }
}
