import { verdict, type CheckResult } from '../types'

export interface ConfigGuardInput {
  playwrightConfig: string
  tsconfig: string
  packageJson: string
}

// Agents cannot loosen the rules: retries stay 0 everywhere, and TypeScript stays strict.
export function checkConfigGuard(input: ConfigGuardInput): CheckResult {
  const findings: string[] = []

  const retries = [...input.playwrightConfig.matchAll(/\bretries\s*:\s*([^,\n}]+)/g)].map(
    match => match[1]?.trim() ?? ''
  )
  if (!retries.length) {
    findings.push('playwright.config.ts: `retries: 0` must be set explicitly')
  }
  for (const value of retries) {
    if (value !== '0') {
      findings.push(`playwright.config.ts: retries is "${value}"; it must be the literal 0`)
    }
  }

  let compilerOptions: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(stripJsonComments(input.tsconfig)) as {
      compilerOptions?: Record<string, unknown>
    }
    compilerOptions = parsed.compilerOptions ?? {}
  } catch {
    findings.push('tsconfig.json: not valid JSON')
  }
  for (const option of ['strict', 'noUncheckedIndexedAccess']) {
    if (compilerOptions[option] !== true) {
      findings.push(`tsconfig.json: compilerOptions.${option} must be true`)
    }
  }

  try {
    const scripts =
      (JSON.parse(input.packageJson) as { scripts?: Record<string, string> }).scripts ?? {}
    for (const [name, command] of Object.entries(scripts)) {
      const retry = /--retries[=\s]+(\d+)/.exec(command)
      if (retry && retry[1] !== '0') {
        findings.push(`package.json scripts.${name}: passes --retries=${retry[1]}`)
      }
    }
  } catch {
    findings.push('package.json: not valid JSON')
  }

  return verdict('config-guard', 'Config guard', findings, 'retries 0, TypeScript strict')
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
