import { hhmmFromStoredTime } from "./intraop-projection"

export function monthYearForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function normalizeLoadedIntraopTiming(
  intraop: { monthYear?: unknown; startTime?: unknown; endTime?: unknown; endTimeNextDay?: unknown } | null | undefined,
  now = new Date(),
): { monthYear: string; startTime: string | null; endTime: string | null; endTimeNextDay: boolean | null } {
  return {
    monthYear: typeof intraop?.monthYear === "string" && intraop.monthYear
      ? intraop.monthYear
      : monthYearForDate(now),
    startTime: hhmmFromStoredTime(intraop?.startTime),
    endTime: hhmmFromStoredTime(intraop?.endTime),
    endTimeNextDay: intraop?.endTimeNextDay != null ? !!intraop.endTimeNextDay : null,
  }
}

export function buildIntraopTimingPatch(
  current: { monthYear: string; startTime: string; endTime: string; endTimeNextDay: boolean },
  overrides?: { startTime?: string; endTime?: string },
): { monthYear: string | null; startTime: string | null; endTime: string | null; endTimeNextDay: boolean } {
  return {
    monthYear: current.monthYear || null,
    startTime: (overrides?.startTime ?? current.startTime) || null,
    endTime: (overrides?.endTime ?? current.endTime) || null,
    endTimeNextDay: current.endTimeNextDay,
  }
}

export function promoteDraftCaseToInProgress<T extends { status?: string }>(caseInfo: T | null): T | null {
  return caseInfo && caseInfo.status === "DRAFT" ? { ...caseInfo, status: "IN_PROGRESS" } : caseInfo
}
