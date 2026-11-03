import { qaName } from '../run-id'

// A user to provision, in this framework's terms. The `user` area's client maps it to the
// /web/users payload. Names carry the run prefix; the phone must be supplied, because only
// numbers the owner controls may be used until the spike shows provisioning sends nothing.
export interface NewUser {
  firstName: string
  lastName: string
  phone: string
  role: 'operator' | 'user'
}

export class UserBuilder {
  private user: NewUser

  constructor(runId: string, label: string, phone: string) {
    this.user = { firstName: qaName(runId, label), lastName: 'qa', phone, role: 'user' }
  }

  asOperator(): this {
    this.user = { ...this.user, role: 'operator' }
    return this
  }

  withLastName(lastName: string): this {
    this.user = { ...this.user, lastName }
    return this
  }

  build(): NewUser {
    return { ...this.user }
  }
}
