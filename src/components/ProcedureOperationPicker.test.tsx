import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const { apiJsonMock } = vi.hoisted(() => ({ apiJsonMock: vi.fn() }))

vi.mock("@/lib/api", () => ({ apiJson: apiJsonMock }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

import { getByText, pressByText, queryByText, render } from "@/test/render"
import { ProcedureOperationPicker } from "./ProcedureOperationPicker"

/**
 * Mirrors ProcedureOperationPicker.test.tsx in lospor-app, case for case: both
 * screens must store the same tag for the same tap.
 */

const GROUP = {
  label: "Cholecystectomy", code: "Cholecystectomy", system: "LOSPOR_PROCEDURE_GROUP",
  group: "Cholecystectomy", domain: "Hepatobiliary System and Pancreas", source: "manual" as const,
}
const CODES = {
  total: 2,
  codes: [
    { code: "0FT40ZZ", description: "Resection of Gallbladder, Open Approach", domain: "Hepatobiliary System and Pancreas" },
    { code: "0FT44ZZ", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach", domain: "Hepatobiliary System and Pancreas" },
  ],
}

/** Lets the list request and its state updates settle. */
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

describe("choosing the exact operation of a planned procedure", () => {
  it("replaces the group with the operation picked, keeping its provenance", async () => {
    apiJsonMock.mockResolvedValue(CODES)
    const onChange = vi.fn()
    const tree = render(<ProcedureOperationPicker value={[GROUP]} onChange={onChange} />)

    expect(queryByText(tree, "procedureNoExact")).not.toBeNull()
    pressByText(tree, "procedureSpecifyExact")
    await settle()
    expect(apiJsonMock).toHaveBeenCalledWith("/api/search/procedures/codes?group=Cholecystectomy&q=")

    pressByText(tree, "Resection of Gallbladder, Percutaneous Endoscopic Approach")
    expect(onChange).toHaveBeenCalledWith([{
      label: "Cholecystectomy", code: "0FT44ZZ", system: "ICD-10-PCS", group: "Cholecystectomy",
      domain: "Hepatobiliary System and Pancreas", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      sub: "0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach", source: "manual",
    }])
  })

  it("shows a chosen operation and can go back to the group alone", () => {
    const onChange = vi.fn()
    const exact = { ...GROUP, code: "0FT44ZZ", system: "ICD-10-PCS", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach" }
    const tree = render(<ProcedureOperationPicker value={[exact]} onChange={onChange} />)

    expect(getByText(tree, "0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach")).toBeTruthy()
    pressByText(tree, "procedureGroupOnly")
    expect(onChange).toHaveBeenCalledWith([{
      label: "Cholecystectomy", code: "Cholecystectomy", system: "LOSPOR_PROCEDURE_GROUP", group: "Cholecystectomy",
      domain: "Hepatobiliary System and Pancreas", sub: "Hepatobiliary System and Pancreas", source: "manual",
    }])
  })

  it("keeps the group when the list cannot be loaded", async () => {
    apiJsonMock.mockRejectedValue(new Error("offline"))
    const onChange = vi.fn()
    const tree = render(<ProcedureOperationPicker value={[GROUP]} onChange={onChange} />)
    pressByText(tree, "procedureSpecifyExact")
    await settle()
    expect(queryByText(tree, "procedureExactUnavailable")).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
