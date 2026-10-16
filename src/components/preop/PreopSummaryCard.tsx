import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { displayResearchScore } from "@lospor/core/research-scores"
import type { PreopSummaryFinding } from "@lospor/core/preop-documents"
import { displayClinicalCode } from "@/lib/clinical-display"
import { PEDIATRIC_PREOP_LABELS } from "@/components/preop/pediatric-preop-labels"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { colors, useThemeRefresh } from "@/theme/colors"

type Tag = { label?: string; code?: string }
type Person = { name: string; title?: string | null } | null | undefined

/** The print data the summary reads, as GET /cases/:id/print-data returns it. */
export type PreopSummaryCase = {
  caseCode?: string | null
  preop: Record<string, unknown> | null
  createdBy?: Person
  user?: Person
  preopFindings?: PreopSummaryFinding[] | null
}

function tags(raw: unknown): Tag[] {
  if (Array.isArray(raw)) return raw.filter((item): item is Tag => !!item && typeof item === "object" && typeof (item as Tag).label === "string")
  if (typeof raw !== "string" || !raw.trim()) return []
  const trimmed = raw.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(item => {
        const value = item as { label?: unknown; inn?: unknown; name?: unknown }
        const label = value.label ?? value.inn ?? value.name
        return { label: typeof label === "string" ? label : undefined }
      }).filter(tag => !!tag.label)
    } catch {}
  }
  return [{ label: trimmed }]
}

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const str = (value: unknown) => typeof value === "string" && value ? value : null
const person = (value: Person) => value?.name ? (value.title ? `${value.title} ${value.name}` : value.name) : null

function Block({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={{ color: muted ? colors.textSecondary : colors.textPrimary, fontSize: 14, fontWeight: muted ? "500" : "600", lineHeight: 20 }}>{children}</Text>
}

/**
 * The preop summary on the phone: the same content as web's sheet, as cards.
 * Findings only, as on paper: a "no" and a question never asked look the same.
 */
export function PreopSummaryCard({ data, language, tc }: {
  data: PreopSummaryCase
  language: "en" | "bg"
  tc: (key: ClinicalStringKey) => string
}) {
  useThemeRefresh()
  const p = data.preop ?? {}
  const fastingLabels = PEDIATRIC_PREOP_LABELS[language]
  const findings = data.preopFindings ?? []
  const comorbidities = tags(p.comorbidities)
  const meds = tags(p.currentMedications)
  const allergyText = tags(p.allergyDetails).map(tag => tag.label).join(", ")
  const labs = Array.isArray(p.labResults) ? (p.labResults as { test?: string; value?: string; unit?: string }[]).filter(lab => lab?.value) : []
  const fasting = Array.isArray(p.pediatricFasting) ? p.pediatricFasting as { category: string; hoursBefore: number }[] : []

  const scores = [
    str(p.asaScore) ? `ASA ${p.asaScore}${p.emergencySurgery === true ? "E" : ""}` : null,
    num(p.rcriScore) != null ? `RCRI ${displayResearchScore("rcri", num(p.rcriScore)!, language)}` : null,
    num(p.apfelScore) != null ? `Apfel ${displayResearchScore("apfel", num(p.apfelScore)!, language)}` : null,
    num(p.stopBangScore) != null ? `STOP-BANG ${displayResearchScore("stopBang", num(p.stopBangScore)!, language)}` : null,
    num(p.povocScore) != null ? `POVOC ${displayResearchScore("povoc", num(p.povocScore)!, language)}` : null,
    num(p.coldsScore) != null ? `COLDS ${displayResearchScore("colds", num(p.coldsScore)!, language)}` : null,
  ].filter((line): line is string => !!line)

  const vitals = [
    num(p.bpSystolic) && num(p.bpDiastolic) ? `${tc("preopSummaryBp")} ${p.bpSystolic}/${p.bpDiastolic}` : null,
    num(p.heartRate) ? `${tc("preopSummaryHr")} ${p.heartRate}` : null,
    num(p.spO2) ? `SpO₂ ${p.spO2} %` : null,
    num(p.temperature) ? `T ${p.temperature} °C` : null,
  ].filter(Boolean).join(" · ")

  const airway = [
    str(p.mallampati) ? `Mallampati ${displayClinicalCode("option:MALLAMPATI", String(p.mallampati), language)}` : null,
    num(p.mouthOpeningCm) ? `${tc("preopSummaryMouthOpening")} ${p.mouthOpeningCm} cm` : null,
    str(p.neckMobility) ? displayClinicalCode("option:NECK_MOBILITY", String(p.neckMobility), language) : null,
  ].filter((line): line is string => !!line)

  const topLevel = findings.filter(finding => !finding.parentKey)
  const childrenOf = (key: string) => findings.filter(finding => finding.parentKey === key)
  const findingText = (finding: PreopSummaryFinding) => finding.option ? `${finding.label[language]}: ${finding.option[language]}` : finding.label[language]
  const consultant = person(data.createdBy)
  const holder = person(data.user)

  return (
    <View style={{ gap: 12 }} testID="preop-summary-card">
      {p.allergies === true || p.latexAllergy === true ? (
        <View testID="preop-summary-allergy" style={{ borderWidth: 2, borderColor: colors.danger, borderRadius: 14, padding: 12 }}>
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>
            {tc("preopSummaryAllergy")}: {[allergyText, p.latexAllergy === true ? tc("preopSummaryLatex") : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ) : p.allergies === false ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{tc("preopSummaryNkda")}</Text> : null}

      {topLevel.length > 0 || comorbidities.length > 0 ? (
        <Block title={tc("preopSummaryFindings")} testID="preop-summary-findings">
          {comorbidities.map((tag, index) => <Row key={`c-${index}`}>{tag.label}</Row>)}
          {topLevel.map(finding => (
            <View key={finding.stableKey}>
              <Row>{findingText(finding)}</Row>
              {childrenOf(finding.stableKey).map(child => <Row key={child.stableKey} muted>{"   – "}{findingText(child)}</Row>)}
            </View>
          ))}
        </Block>
      ) : null}

      {meds.length > 0 ? <Block title={tc("preopSummaryMeds")}>{meds.map((tag, index) => <Row key={index}>{tag.label}</Row>)}</Block> : null}
      {vitals ? <Block title={tc("preopSummaryExam")}><Row>{vitals}</Row></Block> : null}
      {airway.length > 0 || p.difficultAirwayHistory === true || p.anticipatedDifficultAirway === true ? (
        <Block title={tc("preopSummaryAirway")}>
          {airway.map(line => <Row key={line}>{line}</Row>)}
          {p.difficultAirwayHistory === true ? <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "800" }}>{tc("difficultAirwayHx")}</Text> : null}
          {p.anticipatedDifficultAirway === true ? <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "800" }}>{tc("anticipatedDifficultAirway")}</Text> : null}
        </Block>
      ) : null}
      {scores.length > 0 ? <Block title={tc("preopSummaryScores")} testID="preop-summary-scores">{scores.map(line => <Row key={line}>{line}</Row>)}</Block> : null}
      {labs.length > 0 ? <Block title={tc("preopSummaryLabs")}>{labs.slice(0, 16).map((lab, index) => <Row key={index}>{lab.test} {lab.value}{lab.unit ? ` ${lab.unit}` : ""}</Row>)}</Block> : null}
      {fasting.length > 0 ? (
        <Block title={tc("preopSummaryNpo")}>
          {fasting.map(row => {
            const label = row.category === "CLEAR_FLUIDS" ? fastingLabels.clearFluids
              : row.category === "BREAST_MILK" ? fastingLabels.breastMilk
                : row.category === "INFANT_FORMULA_UNDER_1_YEAR" ? fastingLabels.formula
                  : fastingLabels.solids
            return <Row key={row.category}>{label}: {tc("preopSummaryNpoHours").replace("{hours}", String(row.hoursBefore))}</Row>
          })}
        </Block>
      ) : null}

      {consultant ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("preopSummaryConsultedBy")}: {consultant}{holder && holder !== consultant ? ` · ${tc("preopSummaryHandedTo")}: ${holder}` : ""}</Text> : null}
    </View>
  )
}
