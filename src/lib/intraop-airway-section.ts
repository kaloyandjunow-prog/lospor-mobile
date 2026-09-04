import {
  buildAirwaySectionPatch as buildCoreAirwaySectionPatch,
  isAirwayDeviceComplete as isCoreAirwayDeviceComplete,
  syncAirwayDeviceSelection,
} from "@lospor/core/intraop"

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
  awPresentsIntubated: boolean
  awNotApplicable: boolean
}

export type AirwayDeviceCompletenessInput = Omit<
  BuildAirwaySectionPatchInput,
  "awTools" | "awDevices" | "awClGrade" | "awVentModes" | "awNotes" | "awPresentsIntubated" | "awNotApplicable"
>

function coreCompletenessInput(input: AirwayDeviceCompletenessInput) {
  return {
    lmaSize: input.awLmaSize,
    oralTubeSize: input.awOralTubeSize,
    oralCuffed: input.awOralCuffed,
    nasalTubeSize: input.awNasalTubeSize,
    nasalCuffed: input.awNasalCuffed,
    dltType: input.awDltType,
    dltSide: input.awDltSide,
    dltSize: input.awDltSize,
    endobronchialSize: input.awEbSize,
  }
}

export function isAirwayDeviceComplete(
  device: string,
  input: AirwayDeviceCompletenessInput,
): boolean {
  return isCoreAirwayDeviceComplete(device, coreCompletenessInput(input))
}

export { syncAirwayDeviceSelection }

export function buildAirwaySectionPatch(
  input: BuildAirwaySectionPatchInput,
): Record<string, unknown> {
  return {
    ...buildCoreAirwaySectionPatch({
      airwayTools: input.awTools,
      airwayDevices: input.awDevices,
      ...coreCompletenessInput(input),
      cormackLehane: input.awClGrade,
      ventilationModes: input.awVentModes,
      airwayNotes: input.awNotes,
    }),
    // Added alongside core's patch rather than inside it: these say why there
    // is no airway device, which is a fact about the case rather than about a
    // device, and core's builder is shaped around the devices themselves.
    presentsIntubated: input.awPresentsIntubated,
    airwayNotApplicable: input.awNotApplicable,
  }
}
