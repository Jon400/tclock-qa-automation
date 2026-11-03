import { describe, expect, it } from 'vitest'
import { GhError, GitHub, parseIssueUrl } from '../../../tools/dev-loop/github'
import { fixture, recordedGh } from './fixtures'

const REPO = 'https://github.com/qa-owner/tclock-qa-automation'

describe('GitHub wrapper: reads parse recorded --json output', () => {
  it('reads the logged-in account, or none', () => {
    const loggedIn = new GitHub({
      dryRun: false,
      run: recordedGh({ 'auth status': fixture('gh/auth-status.json') }).run
    })
    const loggedOut = new GitHub({
      dryRun: false,
      run: recordedGh({ 'auth status': fixture('gh/auth-status-logged-out.json') }).run
    })

    expect(loggedIn.authenticatedLogin()).toBe('qa-owner')
    expect(loggedOut.authenticatedLogin()).toBeUndefined()
  })

  it('views an issue with the fields intake needs', () => {
    const gh = recordedGh({ 'issue view': fixture('gh/issue-view.json') })
    const issue = new GitHub({ dryRun: false, run: gh.run }).viewIssue(12)

    expect(gh.calls[0]).toEqual([
      'issue',
      'view',
      '12',
      '--json',
      'number,title,body,state,url,labels'
    ])
    expect(issue).toMatchObject({ number: 12, state: 'OPEN', url: `${REPO}/issues/12` })
    expect(issue.labels.map(label => label.name)).toEqual(['test-request', 'area:auth'])
  })

  it('finds the open bug of a case by its exact title prefix', () => {
    const gh = recordedGh({ 'issue list': fixture('gh/issue-list.json') })
    const found = new GitHub({ dryRun: false, run: gh.run }).openBugsForCase('AUTH-UI-003')

    expect(gh.calls[0]).toEqual([
      'issue',
      'list',
      '--label',
      'bug',
      '--state',
      'open',
      '--search',
      'AUTH-UI-003 in:title',
      '--json',
      'number,title'
    ])
    expect(found.map(issue => issue.number)).toEqual([31])
  })

  it('reads the checks of a pull request', () => {
    const checks = new GitHub({
      dryRun: false,
      run: recordedGh({ 'pr checks': fixture('gh/pr-checks.json') }).run
    }).prChecks(42)

    expect(checks.map(check => `${check.name}:${check.state}`)).toEqual([
      'gate:SUCCESS',
      'regression:FAILURE'
    ])
  })
})

describe('GitHub wrapper: writes take --body-file and parse the printed URL', () => {
  it('creates an issue', () => {
    const gh = recordedGh({ 'issue create': fixture('gh/issue-create.txt') })
    const created = new GitHub({ dryRun: false, run: gh.run }).createIssue({
      title: '[AUTH-UI-003] Log out: received 200',
      bodyFile: '.orchestrate/bugs/AUTH-UI-003.md',
      labels: ['bug', 'area:auth']
    })

    expect(gh.calls[0]).toEqual([
      'issue',
      'create',
      '--title',
      '[AUTH-UI-003] Log out: received 200',
      '--body-file',
      '.orchestrate/bugs/AUTH-UI-003.md',
      '--label',
      'bug,area:auth'
    ])
    expect(created).toEqual({ number: 41, url: `${REPO}/issues/41` })
  })

  it('comments on an issue and returns the comment URL', () => {
    const url = new GitHub({
      dryRun: false,
      run: recordedGh({ 'issue comment': fixture('gh/issue-comment.txt') }).run
    }).commentOnIssue(31, '.orchestrate/bugs/AUTH-UI-003.md')

    expect(url).toBe(`${REPO}/issues/31#issuecomment-2200113344`)
  })

  it('opens a pull request', () => {
    const gh = recordedGh({ 'pr create': fixture('gh/pr-create.txt') })
    const pr = new GitHub({ dryRun: false, run: gh.run }).createPullRequest({
      title: 'test(auth): cover session expiry',
      bodyFile: '.orchestrate/pr-body.md',
      base: 'main',
      head: 'test/auth'
    })

    expect(pr).toEqual({ number: 42, url: `${REPO}/pull/42` })
    expect(gh.calls[0]).toContain('--body-file')
  })

  it("fails with gh's own message when gh fails", () => {
    const gh = recordedGh({
      'issue create': {
        code: 1,
        stdout: '',
        stderr: "could not add label: 'area:auth' not found",
        durationMs: 1
      }
    })
    const github = new GitHub({ dryRun: false, run: gh.run })

    expect(() =>
      github.createIssue({ title: 't', bodyFile: 'b.md', labels: ['area:auth'] })
    ).toThrow(GhError)
    expect(() =>
      github.createIssue({ title: 't', bodyFile: 'b.md', labels: ['area:auth'] })
    ).toThrow(/not found/)
  })

  it('refuses output without a URL', () => {
    expect(() => parseIssueUrl('Creating issue in qa-owner/tclock-qa-automation')).toThrow(
      /no issue URL/
    )
  })
})

describe('GitHub wrapper: --dry-run', () => {
  it('prints every write and runs none; reads still run', () => {
    const gh = recordedGh({ 'issue list': '[]' })
    const printed: string[] = []
    const github = new GitHub({ dryRun: true, run: gh.run, log: line => printed.push(line) })

    expect(github.openBugsForCase('AUTH-UI-003')).toEqual([])
    expect(github.createIssue({ title: 'A title', bodyFile: 'b.md', labels: ['bug'] })).toEqual({
      number: 0,
      url: '(dry run)'
    })
    github.commentOnIssue(12, 'c.md')
    github.ensureLabel('area:auth', '1d76db', 'The auth area')
    github.createPullRequest({
      title: 'test(auth): x',
      bodyFile: 'p.md',
      base: 'main',
      head: 'test/auth'
    })

    expect(gh.calls.map(call => call.slice(0, 2).join(' '))).toEqual(['issue list'])
    expect(printed).toEqual([
      '  [dry-run] gh issue create --title "A title" --body-file b.md --label bug',
      '  [dry-run] gh issue comment 12 --body-file c.md',
      '  [dry-run] gh label create area:auth --color 1d76db --description "The auth area" --force',
      '  [dry-run] gh pr create --title "test(auth): x" --body-file p.md --base main --head test/auth'
    ])
  })
})
