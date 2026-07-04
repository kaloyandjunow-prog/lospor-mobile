import { describe, expect, it } from "vitest"
import { commaToTags, diagToTags, valuesFromServerPreop } from "./preop-server-values"

describe("preop server values", () => {
  it("parses comma separated medication tags and JSON arrays", () => {
    expect(commaToTags("Aspirin, Metformin")).toEqual([
      { label: "Aspirin" },
      { label: "Metformin" },
    ])
    expect(commaToTags('[{"label":"Propofol","atcCode":"N01AX10"}]')).toEqual([
      { label: "Propofol", atcCode: "N01AX10" },
    ])
  })

  it("keeps diagnoses split on semicolons instead of commas", () => {
    expect(diagToTags("Benign tumor, appendix; Acute appendicitis")).toEqual([
      { label: "Benign tumor, appendix" },
      { label: "Acute appendicitis" },
    ])
  })

  it("maps server aliases into form defaults", () => {
    const values = valuesFromServerPreop({
      diagnosis: "Appendicitis",
      plannedProcedure: "Appendectomy",
      comorbidities: "Asthma; Diabetes",
      currentMedications: "Salbutamol",
      ulbt: "II",
      difficultAirway: true,
      notes: "team note",
    })

    expect(values.diagnoses).toEqual([{ label: "Appendicitis" }])
    expect(values.procedures).toEqual([{ label: "Appendectomy" }])
    expect(values.comorbidities).toEqual([{ label: "Asthma" }, { label: "Diabetes" }])
    expect(values.currentMedications).toEqual([{ label: "Salbutamol" }])
    expect(values.upperLipBiteTest).toBe("CLASS_II")
    expect(values.difficultAirwayHistory).toBe(true)
    expect(values.teamNotes).toBe("team note")
  })
})
