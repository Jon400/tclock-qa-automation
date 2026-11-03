import { z } from 'zod'
import { AccessMode, SutRole } from '../../config/enum'

// GET /web/auth/session → { user, session }. Fields the tests assert on are strict; the rest
// are optional until an area needs them. Mapped from the served client on 2026-10-16;
// confirm in the passkey spike.
export const SessionUserSchema = z.object({
  db_role: z.enum([SutRole.admin, SutRole.operator, SutRole.user]),
  identity_scope: z.string().nullish(),
  access_mode: z.enum([AccessMode.full, AccessMode.reportsOnly]).nullish(),
  company_internal_id: z.union([z.string(), z.number()]).nullish(),
  active_company_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish()
})

// The same values TClock also sends as X-Web-Session-* headers: 15 min idle, 5 h absolute.
export const SessionInfoSchema = z.object({
  created_at: z.string(),
  last_seen_at: z.string(),
  idle_expires_at: z.string(),
  absolute_expires_at: z.string(),
  expires_at: z.string()
})

export const SessionResponseSchema = z.object({
  user: SessionUserSchema,
  session: SessionInfoSchema
})

export type SessionUser = z.infer<typeof SessionUserSchema>
export type SessionResponse = z.infer<typeof SessionResponseSchema>
