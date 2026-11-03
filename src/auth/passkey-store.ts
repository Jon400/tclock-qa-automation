import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { Role } from '../config/enum'
import { passkeyPath } from '../config/paths'
import { exists, readText, writeText } from '../utils/file-utils'

// One WebAuthn credential as CDP's WebAuthn.getCredentials returns it and
// WebAuthn.addCredential accepts it. `privateKey` is a base64 PKCS#8 key: whoever holds this
// file can log in as the QA user, which is why .auth/ is gitignored and hook-blocked.
export const PasskeyCredentialSchema = z.object({
  credentialId: z.string().min(1),
  isResidentCredential: z.boolean(),
  rpId: z.string().min(1),
  privateKey: z.string().min(1),
  userHandle: z.string().optional(),
  signCount: z.number().int().nonnegative(),
  largeBlob: z.string().optional(),
  backupEligibility: z.boolean().optional(),
  backupState: z.boolean().optional(),
  userName: z.string().optional(),
  userDisplayName: z.string().optional()
})
export type PasskeyCredential = z.infer<typeof PasskeyCredentialSchema>

export const PasskeyFileSchema = z.object({
  version: z.literal(1),
  role: z.string(),
  savedAt: z.string(),
  credential: PasskeyCredentialSchema
})
export type PasskeyFile = z.infer<typeof PasskeyFileSchema>

export function serializePasskey(
  role: Role,
  credential: PasskeyCredential,
  now: Date = new Date()
): string {
  const file: PasskeyFile = {
    version: 1,
    role,
    savedAt: now.toISOString(),
    credential: PasskeyCredentialSchema.parse(credential)
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function deserializePasskey(role: Role, text: string): PasskeyCredential {
  const file = PasskeyFileSchema.parse(JSON.parse(text))
  if (file.role !== role) {
    throw new Error(`Passkey file belongs to "${file.role}", not "${role}"`)
  }
  return file.credential
}

export async function loadPasskey(role: Role): Promise<PasskeyCredential> {
  const file = passkeyPath(role)
  if (!(await exists(file))) {
    throw new Error(
      `No passkey for "${role}". Enroll the QA user once with: npm run auth:enroll -- --role ${role}`
    )
  }
  return deserializePasskey(role, await readText(file))
}

export async function savePasskey(role: Role, credential: PasskeyCredential): Promise<void> {
  await writeText(passkeyPath(role), serializePasskey(role, credential))
}

// Every login signs with the credential and raises its signCount. A server that checks the
// counter rejects an older copy, so every login of a role runs under this lock and saves the
// credential back before the next one starts.
export async function withPasskeyLock<T>(
  role: Role,
  body: () => Promise<T>,
  { timeoutMs = 60_000, staleMs = 120_000 } = {}
): Promise<T> {
  const lock = `${passkeyPath(role)}.lock`
  await mkdir(path.dirname(lock), { recursive: true })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await mkdir(lock)
      break
    } catch {
      const info = await stat(lock).catch(() => undefined)
      if (info && Date.now() - info.mtimeMs > staleMs) {
        await rm(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the ${role} passkey lock (${lock})`)
      }
      await delay(250)
    }
  }
  try {
    return await body()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}
