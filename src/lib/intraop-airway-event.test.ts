import { describe, expect, it } from "vitest"
import { formatAirwayEventLabel } from "./intraop-airway-event"

describe("formatAirwayEventLabel", () => {
  it("formats intubation details with cuff, tool, and CL grade", () => {
    const label = formatAirwayEventLabel("Intubated", {
      tubeSize: "7.0",
      cuffed: "yes",
      tool: "Video",
      cl: "2",
    })

    expect(label).toContain("Intubated")
    expect(label).toContain("7.0mm cuffed")
    expect(label).toContain("Video")
    expect(label).toContain("CL 2")
  })

  it("formats uncuffed intubation without CL grade", () => {
    const label = formatAirwayEventLabel("Intubated", {
      tubeSize: "6.0",
      cuffed: "no",
      tool: "Direct",
    })

    expect(label).toContain("6.0mm uncuffed")
    expect(label).not.toContain("CL")
  })

  it("formats non-intubation airway labels as LMA details", () => {
    expect(formatAirwayEventLabel("LMA", {
      tubeSize: "4",
      cuffed: "yes",
      tool: "Direct",
    })).toBe("LMA (LMA 4)")
  })
})
