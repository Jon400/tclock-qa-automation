// Anything that leaves the owner's machine (bug issues, PR bodies, issue comments) passes
// through here first, and secretlint checks it again before filing. Traces and screenshots
// never leave at all; only their local path is mentioned.

// A long opaque value: a run of 32+ characters with no slash and with both letters and
// digits. A file path (".orchestrate/runs/<run-id>/area/trace.zip") is not one.
const looksLikeToken = (value: string) =>
  /[A-Za-z0-9+_-]{32,}/.test(value) && /\d/.test(value) && /[A-Za-z]/.test(value)

const RULES: readonly [RegExp, string | ((match: string) => string)][] = [
  // Cookie and Set-Cookie headers, and cookie-like name=value pairs.
  [/((?:set-)?cookie["']?\s*[:=]\s*)[^\n]*/gi, '$1[redacted]'],
  [/\b(session|sid|token|auth|jwt|csrf)[\w-]*=([^;\s"']+)/gi, '$1=[redacted]'],
  [/(authorization["']?\s*[:=]\s*)[^\n]*/gi, '$1[redacted]'],
  // WebAuthn material.
  [
    /("?(privateKey|userHandle|credentialId|signature|attestationObject|clientDataJSON)"?\s*[:=]\s*)"?[^",\s}]+"?/gi,
    '$1[redacted]'
  ],
  // Israeli phone numbers (the QA users' phones live in .env only).
  [/(?<![\d-])(?:\+972-?|0)5\d-?\d{3}-?\d{4}(?![\d-])/g, '[phone]'],
  // Israeli ID numbers and long opaque tokens.
  [/(?<!\d)\d{9}(?!\d)/g, '[number]'],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, match => (looksLikeToken(match) ? '[token]' : match)]
]

export function redact(text: string): string {
  return RULES.reduce(
    (current, [pattern, replacement]) =>
      typeof replacement === 'string'
        ? current.replace(pattern, replacement)
        : current.replace(pattern, replacement),
    text
  )
}
