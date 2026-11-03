// The notice above the embedded login form when a session has expired, by reason.
export const reAuthDialogLabels = {
  notice: {
    generic: 'החיבור שלך פג מסיבות אבטחה. התחבר/י מחדש כדי להמשיך מהנקודה שבה עצרת.',
    idle: 'החיבור שלך פג עקב חוסר פעילות. התחבר/י מחדש כדי להמשיך.',
    absolute: 'מטעמי אבטחה זמן ההתחברות המרבי הסתיים. התחבר/י מחדש כדי להמשיך.'
  }
} as const

export type ExpiryReason = keyof typeof reAuthDialogLabels.notice
