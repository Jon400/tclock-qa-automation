import { z } from 'zod'

// The body of a failed /web/* call. `error_code` names the reason, e.g. on a 401:
// session_missing, session_invalid, session_idle_expired, session_absolute_expired.
export const WebErrorSchema = z.object({
  error: z.string().nullish(),
  error_code: z.string().nullish()
})

export type WebError = z.infer<typeof WebErrorSchema>
