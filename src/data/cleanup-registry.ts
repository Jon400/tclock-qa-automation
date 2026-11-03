// TClock can't delete anything: users, branches and work-report locations are deactivated
// instead. Every entity a test creates registers its deactivation here; the `cleanup`
// fixture runs them after the test, newest first, and reports every failure at once.
export interface CleanupEntry {
  label: string
  run: () => Promise<void>
}

export class CleanupRegistry {
  private readonly entries: CleanupEntry[] = []

  register(label: string, run: () => Promise<void>): void {
    this.entries.push({ label, run })
  }

  get size(): number {
    return this.entries.length
  }

  async runAll(): Promise<void> {
    const failures: string[] = []
    for (const entry of this.entries.splice(0).reverse()) {
      try {
        await entry.run()
      } catch (error) {
        failures.push(`${entry.label}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failures.length) {
      throw new Error(
        `Cleanup failed for ${failures.length} entit${failures.length === 1 ? 'y' : 'ies'}:\n${failures.join('\n')}`
      )
    }
  }
}
