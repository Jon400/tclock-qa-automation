import { ESLint } from 'eslint'
import path from 'node:path'
import tseslint from 'typescript-eslint'
import { REPO_ROOT } from '../exec'
import { verdict, type CheckResult } from '../types'

// ESLint carries most of the non-negotiable rules: no raw locators, request calls, sleeps or
// Hebrew in specs; no skipped, focused or expected-to-fail tests; no LLM SDK or tools/
// import in src/ or tests/ (eslint.config.js, owner-only).
export async function checkEslint(cwd: string = REPO_ROOT): Promise<CheckResult> {
  const eslint = new ESLint({ cwd })
  const results = await eslint.lintFiles(['.'])
  return verdict('eslint', 'ESLint', formatResults(results, cwd), `${results.length} files clean`)
}

// Lints source text as if it lived at `filePath`, with the repository's real config. Used by
// the gate's unit tests to prove each rule fires. Type-aware rules need the file on disk, so
// they are switched off here; every rule the tests prove is syntactic.
export async function lintText(
  code: string,
  filePath: string,
  cwd: string = REPO_ROOT
): Promise<string[]> {
  const eslint = new ESLint({
    cwd,
    overrideConfig: [{ ...tseslint.configs.disableTypeChecked, files: ['**/*.ts', '**/*.js'] }]
  })
  const results = await eslint.lintText(code, { filePath: path.join(cwd, filePath) })
  return results.flatMap(result =>
    result.messages.map(message => message.ruleId ?? message.message)
  )
}

function formatResults(results: ESLint.LintResult[], cwd: string): string[] {
  return results.flatMap(result =>
    result.messages.map(message => {
      const file = path.relative(cwd, result.filePath).replace(/\\/g, '/')
      return `${file}:${message.line}:${message.column} ${message.ruleId ?? 'error'}: ${message.message}`
    })
  )
}
