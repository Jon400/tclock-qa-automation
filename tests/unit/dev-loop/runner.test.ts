import { describe, expect, it } from 'vitest'
import type { Failure } from '../../../tools/dev-loop/classify'
import { commandLine, evaluateExitCriteria, profileSteps } from '../../../tools/dev-loop/runner'
import { parseExecutionPlan } from '../../../tools/gates/parsers/execution-plan'
import { parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import { repoFile } from './fixtures'

const EXECUTION = parseExecutionPlan(repoFile('.test/auth/execution-plan.md'))
const CASES = parseTestPlan(
  repoFile('.test/auth/test-plan.md'),
  'auth',
  '.test/auth/test-plan.md'
).cases
const ALL_PASSED = Object.fromEntries(CASES.map(plannedCase => [plannedCase.id, 'passed' as const]))

describe('run profiles', () => {
  it('runs setup alone, and every other step without dependencies, so a repeat never logs in again', () => {
    expect(profileSteps('setup')).toEqual([{ step: 'setup', args: ['test', '--project=setup'] }])
    for (const step of profileSteps('area', {
      plan: EXECUTION,
      newSpecFiles: ['tests/ui/auth/login.spec.ts']
    })) {
      expect(step.args).toContain('--no-deps')
      expect(step.args).not.toContain('--retries')
    }
  })

  it('runs @serial cases in their own one-worker step', () => {
    const [main, serial] = profileSteps('smoke')

    expect(main?.args).toEqual(
      expect.arrayContaining(['--grep', '@smoke', '--grep-invert', '@serial'])
    )
    expect(serial?.args).toEqual(
      expect.arrayContaining([
        '--grep',
        '(?=.*@smoke)(?=.*@serial)',
        '--workers=1',
        '--pass-with-no-tests'
      ])
    )
  })

  it('repeats new or changed specs newCaseRepeat times', () => {
    const steps = profileSteps('area', {
      plan: EXECUTION,
      newSpecFiles: ['tests/ui/auth/login.spec.ts']
    })

    expect(steps.map(step => step.step)).toEqual(['area', 'area-serial', 'repeat'])
    expect(steps[2]?.args).toEqual(
      expect.arrayContaining(['--repeat-each', '3', '--workers=1', 'ui/auth/login.spec.ts'])
    )
  })

  it('leaves quarantined cases out of the regression profile', () => {
    expect(profileSteps('regression')[0]?.args).toEqual(
      expect.arrayContaining(['--grep-invert', '@quarantine|@serial'])
    )
  })

  it('prints a command line the owner can paste', () => {
    expect(commandLine({ step: 'x', args: ['test', '--grep', '(?=.*@auth)(?=.*@serial)'] })).toBe(
      'npx playwright test --grep "(?=.*@auth)(?=.*@serial)"'
    )
  })
})

const failure = (caseId: string, failureClass: Failure['class']): Failure => ({
  caseId,
  title: caseId,
  file: 'tests/ui/auth/logout.spec.ts',
  line: 1,
  project: 'ui',
  step: undefined,
  errors: [],
  tracePath: undefined,
  passed: 0,
  failed: 1,
  class: failureClass,
  reason: ''
})

describe('area exit criteria', () => {
  it('are met when every planned case passed', () => {
    expect(evaluateExitCriteria(EXECUTION, CASES, ALL_PASSED, [], new Set()).met).toBe(true)
  })

  it('fail on a failed P1 case, a flaky case or an untriaged failure', () => {
    const verdict = evaluateExitCriteria(
      EXECUTION,
      CASES,
      { ...ALL_PASSED, 'AUTH-UI-003': 'failed', 'AUTH-API-001': 'flaky' },
      [failure('AUTH-UI-003', 'untriaged')],
      new Set()
    )

    expect(verdict.met).toBe(false)
    expect(verdict.details).toEqual([
      'P1 pass rate 50% (needs 100%)',
      'overall pass rate 50% (needs 100%)',
      'new flaky 1 (max 0)',
      'untriaged failures 1 (max 0)',
      'quarantined and not counted: none'
    ])
  })

  it('do not count a quarantined case', () => {
    const verdict = evaluateExitCriteria(
      EXECUTION,
      CASES,
      { ...ALL_PASSED, 'AUTH-UI-003': 'failed' },
      [failure('AUTH-UI-003', 'product-bug')],
      new Set(['AUTH-UI-003'])
    )

    expect(verdict.met).toBe(true)
    expect(verdict.details.at(-1)).toBe('quarantined and not counted: AUTH-UI-003')
  })

  it('count a case that never ran as not passed', () => {
    const { 'AUTH-UI-001': _skipped, ...rest } = ALL_PASSED

    expect(evaluateExitCriteria(EXECUTION, CASES, rest, [], new Set()).met).toBe(false)
  })
})
