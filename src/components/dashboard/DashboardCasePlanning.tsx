import { useEffect, useState } from "react"
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { apiFetch } from "@/lib/api"
import { DateWheel } from "@/components/DateWheel"
import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"

/**
 * Two steps of the dashboard's long-press menu (10.8.0): the planned date of
 * the operation, on the same date wheel as the web; and an anaesthesia nurse
 * passing her place in the case to another nurse.
 */
const row = { paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border } as const

export function PlannedDateStep({ caseId, value, tc, onDone, onBack }: {
  caseId: string
  value: string | null
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(value) ?? parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (plannedSurgeryDate: string | null) => {
    setBusy(true)
    setFailed(false)
    try {
      const response = await apiFetch(`/api/cases/${caseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedSurgeryDate }) })
      if (response.ok) onDone(); else setFailed(true)
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmPlannedDate")}</Text>
      <DateWheel value={date} onChange={setDate} labels={{ day: tc("dmDay"), month: tc("dmMonth"), year: tc("dmYear") }} />
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginTop: 8 }}>{tc("dmFailed")}</Text> : null}
      <TouchableOpacity testID="planned-date-save" style={{ marginTop: 16, minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }} onPress={() => { void save(calendarDateKey(date)) }} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.background, fontSize: 16, fontWeight: "800" }}>{tc("dmSave")}</Text>}
      </TouchableOpacity>
      {value ? <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={() => { void save(null) }} disabled={busy}><Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "700" }}>{tc("dmClearDate")}</Text></TouchableOpacity> : null}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}

type Nurse = { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null }
const nameOf = (nurse: Nurse) => [nurse.title, nurse.firstName, nurse.lastName].filter(Boolean).join(" ") || nurse.name

export function NurseHandoverStep({ caseId, tc, onDone, onBack }: {
  caseId: string
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [nurses, setNurses] = useState<Nurse[] | null>(null)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void apiFetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }).then(body => setNurses(body.nurses ?? []), () => setNurses([]))
  }, [])
  const handOver = async (id: string) => {
    setFailed(false)
    let response: Response
    try { response = await apiFetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoverTo: id }) }) } catch { setFailed(true); return }
    if (response.ok) { setDone(true); setTimeout(onDone, 700) } else setFailed(true)
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmHandToNurse")}</Text>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{tc("dmFailed")}</Text> : null}
      {done ? <Text style={{ color: colors.success, fontSize: 15, fontWeight: "800" }}>{tc("dmHandedOver")}</Text>
        : nurses === null ? <ActivityIndicator color={colors.primary} />
          : nurses.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{tc("dmNoNurses")}</Text>
            : nurses.map(nurse => (
              <TouchableOpacity key={nurse.id} style={row} onPress={() => { void handOver(nurse.id) }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{nameOf(nurse)}</Text>
              </TouchableOpacity>
            ))}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}

/** The case's anaesthesia nurses (10.8.0), as the web row menu sets them. */
export function CaseNursesStep({ caseId, tc, onDone, onBack }: {
  caseId: string
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [nurses, setNurses] = useState<Nurse[] | null>(null)
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void Promise.all([
      apiFetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }),
      apiFetch(`/api/cases/${caseId}/nurses`).then(response => response.ok ? response.json() : { nurses: [] }),
    ]).then(([list, current]) => {
      setNurses(list.nurses ?? [])
      setAssigned(new Set((current.nurses ?? []).map((row: { userId: string }) => row.userId)))
    }, () => setNurses([]))
  }, [caseId])
  const toggle = async (id: string) => {
    let response: Response
    try { response = await apiFetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assigned.has(id) ? { remove: id } : { assign: id }) }) } catch { setFailed(true); return }
    if (!response.ok) { setFailed(true); return }
    setFailed(false)
    const next = await response.json()
    setAssigned(new Set((next.nurses ?? []).map((row: { userId: string }) => row.userId)))
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmCaseNurses")}</Text>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{tc("dmFailed")}</Text> : null}
      {nurses === null ? <ActivityIndicator color={colors.primary} />
        : nurses.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{tc("dmNoNurses")}</Text>
          : nurses.map(nurse => (
            <TouchableOpacity key={nurse.id} testID={`case-nurse-${nurse.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: assigned.has(nurse.id) }}
              style={{ ...row, flexDirection: "row", alignItems: "center", gap: 12 }} onPress={() => { void toggle(nurse.id) }}>
              <Text style={{ color: assigned.has(nurse.id) ? colors.primary : colors.textMuted, fontSize: 20, fontWeight: "800" }}>{assigned.has(nurse.id) ? "☑" : "☐"}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{nameOf(nurse)}</Text>
            </TouchableOpacity>
          ))}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onDone}><Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{tc("dmSave")}</Text></TouchableOpacity>
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}