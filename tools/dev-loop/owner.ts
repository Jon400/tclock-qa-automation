import { createInterface } from 'node:readline/promises'

// The owner's gates (✋). The driver stops and waits for an answer in the terminal; there is
// no flag that answers for the owner. Under --dry-run a gate is printed and passed.

export interface OwnerIO {
  ask(question: string): Promise<string>
  print(line: string): void
}

export const terminalIO: OwnerIO = {
  async ask(question) {
    const readline = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return (await readline.question(question)).trim()
    } finally {
      readline.close()
    }
  },
  print: line => console.log(line)
}

export interface Choice<T extends string> {
  key: string
  value: T
  label: string
}

export async function choose<T extends string>(
  io: OwnerIO,
  question: string,
  choices: Choice<T>[]
): Promise<T> {
  const menu = choices.map(choice => `[${choice.key}] ${choice.label}`).join('  ')
  for (;;) {
    const answer = (await io.ask(`${question}\n  ${menu}\n  > `)).toLowerCase()
    const picked = choices.find(choice => choice.key === answer || choice.value === answer)
    if (picked) return picked.value
    io.print(`  Please answer one of: ${choices.map(choice => choice.key).join(', ')}`)
  }
}

export interface GateRequest {
  gate: '0' | 'A' | 'B' | 'C'
  title: string
  details: string[]
}

export async function ownerGate(
  io: OwnerIO,
  request: GateRequest,
  dryRun: boolean
): Promise<'approve' | 'reject'> {
  io.print(`\n✋ Gate ${request.gate}: ${request.title}`)
  for (const detail of request.details) io.print(`   ${detail}`)
  if (dryRun) {
    io.print('   [dry-run] the driver would stop here for the owner')
    return 'approve'
  }
  return choose(io, '   Approve?', [
    { key: 'y', value: 'approve', label: 'approve' },
    { key: 'n', value: 'reject', label: 'reject and stop' }
  ])
}
