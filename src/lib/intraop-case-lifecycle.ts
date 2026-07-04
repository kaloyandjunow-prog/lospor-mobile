import { formatHHMM } from "./intraop-format"

export const CASE_RESUME_WINDOW_SECONDS = 30 * 60

export function buildFinaliseCaseState(
  continuedItems: string[],
  endedAt = new Date(),
): {
  continuedItems: string[] | null
  endTime: string
  endedAt: Date
  resumeSecsLeft: number
} {
  return {
    continuedItems: continuedItems.length > 0 ? continuedItems : null,
    endTime: formatHHMM(endedAt),
    endedAt,
    resumeSecsLeft: CASE_RESUME_WINDOW_SECONDS,
  }
}

export function buildResumeCaseState(): {
  endTime: string
  endedAt: Date | null
  resumeSecsLeft: number
  patch: { endTime: null }
} {
  return {
    endTime: "",
    endedAt: null,
    resumeSecsLeft: 0,
    patch: { endTime: null },
  }
}
