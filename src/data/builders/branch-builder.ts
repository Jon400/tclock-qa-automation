import { qaName } from '../run-id'

// A branch to create, in this framework's terms. The `branch` area's client maps it to the
// /web/branches payload. The code is unique per run so parallel runs never collide.
export interface NewBranch {
  name: string
  code: string
}

export class BranchBuilder {
  private branch: NewBranch

  constructor(runId: string, label: string) {
    this.branch = { name: qaName(runId, label), code: runId.replace(/\D/g, '').slice(-6) }
  }

  withCode(code: string): this {
    this.branch = { ...this.branch, code }
    return this
  }

  build(): NewBranch {
    return { ...this.branch }
  }
}
