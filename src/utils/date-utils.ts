import { UI_TIMEZONE } from '../config/locale'

const pad = (value: number) => String(value).padStart(2, '0')

// The calendar date in Israel for an instant, as { year, month (1-12), day }.
export function israelDateParts(instant: Date = new Date()): {
  year: number
  month: number
  day: number
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant)
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

// `YYYY-MM-DD` in Israel time: the format TClock's API uses for dates.
export function isoDate(instant: Date = new Date()): string {
  const { year, month, day } = israelDateParts(instant)
  return `${year}-${pad(month)}-${pad(day)}`
}

// `DD/MM/YYYY` in Israel time: the format the Hebrew UI displays.
export function formatDayMonthYear(instant: Date): string {
  const { year, month, day } = israelDateParts(instant)
  return `${pad(day)}/${pad(month)}/${year}`
}

// `MM/YYYY`, for month pickers and monthly reports. `month` is 1-12.
export function formatMonthYear(year: number, month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Month must be 1-12, got ${month}`)
  }
  return `${pad(month)}/${year}`
}

// The previous calendar month, which is usually the one a monthly report is about.
export function previousMonth(instant: Date = new Date()): { year: number; month: number } {
  const { year, month } = israelDateParts(instant)
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}
