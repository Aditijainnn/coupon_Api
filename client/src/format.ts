// `undefined` = use the visitor's own language settings, e.g. 1,000.00 and 31 Dec 2030, 11:59 pm in India.
const moneyFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatMoney(value: number): string {
  return moneyFormat.format(value);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/*
 * <input type="datetime-local"> works with local time and no timezone, like "2026-11-24T23:59".
 * The API needs a full ISO date with a timezone, so the page converts between the two.
 */

/** 30 days from now at 23:59, in the format the date input expects. */
export function defaultExpiryInput(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(23, 59, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts the input's local time into an ISO date in UTC, or null when the input is empty or invalid. */
export function localInputToIso(value: string): string | null {
  if (value === '') {
    return null;
  }
  const date = new Date(value); // a date and time without a timezone is read as local time
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
