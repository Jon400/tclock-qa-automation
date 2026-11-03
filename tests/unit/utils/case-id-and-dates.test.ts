import { describe, expect, it } from 'vitest'
import { parseCaseId, parseRequirementId, prefixOfArea } from '../../../src/utils/case-id'
import {
  formatDayMonthYear,
  formatMonthYear,
  isoDate,
  previousMonth
} from '../../../src/utils/date-utils'

describe('case and requirement IDs', () => {
  it('parses a case ID into area, layer and number', () => {
    expect(parseCaseId('AUTH-UI-001')).toEqual({
      id: 'AUTH-UI-001',
      area: 'auth',
      layer: 'ui',
      number: 1
    })
    expect(parseCaseId('EMPLOYEE-REPORT-E2E-012')).toMatchObject({
      area: 'employee-report',
      layer: 'e2e'
    })
  })

  it.each(['AUTH-UI-1', 'auth-ui-001', 'AUTH-DB-001', 'AUTH-AC-01', 'UI-001'])(
    'rejects the case ID %s',
    id => {
      expect(parseCaseId(id)).toBeUndefined()
    }
  )

  it('parses a requirement ID', () => {
    expect(parseRequirementId('WORK-REPORT-LOCATION-AC-03')).toEqual({
      id: 'WORK-REPORT-LOCATION-AC-03',
      area: 'work-report-location',
      number: 3
    })
    expect(parseRequirementId('AUTH-AC-1')).toBeUndefined()
  })

  it('maps an area slug to its ID prefix', () => {
    expect(prefixOfArea('employee-report')).toBe('EMPLOYEE-REPORT')
  })
})

describe('dates in Israel time', () => {
  // 22:30 UTC on 31 Dec is already 1 Jan in Israel (UTC+2 in winter).
  const newYearInIsrael = new Date('2026-12-31T22:30:00Z')

  it('uses the Israeli calendar date', () => {
    expect(isoDate(newYearInIsrael)).toBe('2027-01-01')
    expect(formatDayMonthYear(newYearInIsrael)).toBe('01/01/2027')
  })

  it('finds the previous month across a year boundary', () => {
    expect(previousMonth(newYearInIsrael)).toEqual({ year: 2026, month: 12 })
  })

  it('formats a month and rejects an impossible one', () => {
    expect(formatMonthYear(2026, 3)).toBe('03/2026')
    expect(() => formatMonthYear(2026, 13)).toThrow()
  })
})
