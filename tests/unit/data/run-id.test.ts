import { describe, expect, it } from 'vitest'
import { createRunId, isFromRun, isQaName, isRunId, qaName } from '../../../src/data/run-id'

describe('runId', () => {
  it('is YYMMDD-HHMMSS-xxxx in UTC', () => {
    const runId = createRunId(new Date('2026-10-16T09:05:07Z'), () => 'a1b2')

    expect(runId).toBe('261016-090507-a1b2')
    expect(isRunId(runId)).toBe(true)
  })

  it('sorts by time', () => {
    const earlier = createRunId(new Date('2026-10-16T09:05:07Z'), () => 'ffff')
    const later = createRunId(new Date('2026-10-16T09:05:08Z'), () => '0000')

    expect([later, earlier].sort()).toEqual([earlier, later])
  })

  it('differs between two runs started in the same second', () => {
    const now = new Date('2026-10-16T09:05:07Z')

    expect(createRunId(now)).not.toBe(createRunId(now, () => 'zzzz'))
  })

  it.each(['261016-0905-a1b2', '261016-090507-A1B2', 'qa-261016-090507-a1b2'])(
    'rejects %s',
    value => {
      expect(isRunId(value)).toBe(false)
    }
  )
})

describe('qaName', () => {
  const runId = '261016-090507-a1b2'

  it('prefixes the run and slugs the label', () => {
    expect(qaName(runId, 'Night Shift Branch')).toBe('qa-261016-090507-a1b2-night-shift-branch')
  })

  it('recognises names from this run and from any QA run', () => {
    const name = qaName(runId, 'user')

    expect(isQaName(name)).toBe(true)
    expect(isFromRun(name, runId)).toBe(true)
    expect(isFromRun(name, '261016-090508-a1b2')).toBe(false)
    expect(isQaName('Main branch')).toBe(false)
  })

  it('refuses a bad run id or an empty label', () => {
    expect(() => qaName('today', 'user')).toThrow(/run id/)
    expect(() => qaName(runId, '!!!')).toThrow(/label/)
  })
})
