import React from "react"
import { describe, expect, it } from "vitest"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { PreopSummaryCard } from "./PreopSummaryCard"

const tc = (language: "en" | "bg") => (key: string) => (CLINICAL_STRINGS[language] as Record<string, string>)[key] ?? key
const text = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON())

describe("the preop summary on the PWA", () => {
  it("shows the allergy frame, findings with follow-ups, and scores", () => {
    const shown = text(render(<PreopSummaryCard language="bg" tc={tc("bg")} data={{
      preop: { allergies: true, allergyDetails: "[{\"label\":\"Пеницилин\"}]", asaScore: "II", apfelScore: 3 },
      preopFindings: [
        { stableKey: "A11", parentKey: null, label: { en: "Dysphagia", bg: "Дисфагия" }, option: null },
        { stableKey: "A11_L", parentKey: "A11", label: { en: "Liquids", bg: "Течности" }, option: null },
      ],
      createdBy: { name: "А. Николов", title: "д-р" },
      user: { name: "С. Димитрова", title: "д-р" },
    }} />))
    expect(shown).toContain("АЛЕРГИЯ")
    expect(shown).toContain("Пеницилин")
    expect(shown).toContain("Дисфагия")
    expect(shown).toContain("Течности")
    expect(shown).toContain("ASA II")
    expect(shown).toContain("Apfel 3 / 4")
    expect(shown).toContain("д-р С. Димитрова")
  })

  it("says nothing about findings when there are none", () => {
    const shown = text(render(<PreopSummaryCard language="en" tc={tc("en")} data={{ preop: { allergies: false } }} />))
    expect(shown).toContain("No known allergies")
    expect(shown).not.toContain("Findings")
  })
})
