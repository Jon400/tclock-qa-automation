import type { Layer } from '../config/enum'

// Acceptance criterion: <AREA>-AC-NN, e.g. AUTH-AC-01.
export const REQUIREMENT_ID_PATTERN = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-AC-(\d{2})$/
// Test case: <AREA>-<LAYER>-NNN, e.g. AUTH-UI-001.
export const CASE_ID_PATTERN = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-(UI|API|E2E)-(\d{3})$/

export interface CaseId {
  id: string
  area: string
  layer: Layer
  number: number
}

// The area slug for an ID prefix: EMPLOYEE-REPORT → employee-report.
export function areaOfPrefix(prefix: string): string {
  return prefix.toLowerCase()
}

// The ID prefix for an area slug: employee-report → EMPLOYEE-REPORT.
export function prefixOfArea(area: string): string {
  return area.toUpperCase()
}

export function parseCaseId(id: string): CaseId | undefined {
  const match = CASE_ID_PATTERN.exec(id)
  if (!match?.[1] || !match[2] || !match[3]) return undefined
  return {
    id,
    area: areaOfPrefix(match[1]),
    layer: match[2].toLowerCase() as Layer,
    number: Number(match[3])
  }
}

export function parseRequirementId(
  id: string
): { id: string; area: string; number: number } | undefined {
  const match = REQUIREMENT_ID_PATTERN.exec(id)
  if (!match?.[1] || !match[2]) return undefined
  return { id, area: areaOfPrefix(match[1]), number: Number(match[2]) }
}
