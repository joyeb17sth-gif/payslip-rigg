/**
 * Shared storage & synchronization for the active pay period across pages
 * (Payslips Generator, Exceptions Manager, Training Tracker).
 */

export interface ActivePayPeriod {
  start: string; // e.g. "01-Sep"
  end: string;   // e.g. "07-Sep"
}

export const STORAGE_KEY_START = 'payslip_period_start';
export const STORAGE_KEY_END = 'payslip_period_end';
export const PAY_PERIOD_EVENT = 'pay-period-changed';

export const DEFAULT_PERIOD: ActivePayPeriod = {
  start: '01-Sep',
  end: '07-Sep',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Normalizes user-entered date strings like "1-Sep", "1 Sep", "01-Sep" -> "01-Sep"
 */
export function normalizeSingleDate(str?: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  // Match single or double digit day followed by optional separator and month name
  const match = trimmed.match(/^(\d{1,2})[-/\s.]*([A-Za-z]+)$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mStr = match[2].toLowerCase();
    const foundMonth = SHORT_MONTHS.find(m => m.toLowerCase().startsWith(mStr.substring(0, 3))) || match[2];
    return `${day}-${foundMonth}`;
  }
  return trimmed;
}

/**
 * Safely splits a range string on " to ", " - ", or dash characters like "–" / "—"
 * without splitting the internal hyphen in date formats like "01-Sep".
 */
export function splitPeriodRange(str?: string): string[] {
  if (!str) return [];
  const trimmed = str.trim();
  const parts = trimmed.split(/\s+(?:to|-)\s+|\s*[–—]\s*/i);
  if (parts.length === 2) return parts;

  const toMatch = trimmed.match(/^(.+?)\s+to\s+(.+)$/i);
  if (toMatch) return [toMatch[1], toMatch[2]];

  return [trimmed];
}

/**
 * Normalizes full pay period strings like "1-Sep to 7-Sep", "01-Sep–07-Sep", "1 sep to 7" -> "01-Sep to 07-Sep"
 */
export function normalizePayPeriodString(str?: string): string {
  if (!str || str.toLowerCase() === 'all') return str || '';
  const trimmed = str.trim();
  
  const parts = splitPeriodRange(trimmed);
  if (parts.length === 2) {
    const s = normalizeSingleDate(parts[0]);
    let e = normalizeSingleDate(parts[1]);
    // If end is just a number like "7", inherit the month from start
    if (/^\d{1,2}$/.test(parts[1].trim()) && s.includes('-')) {
      const month = s.split('-')[1];
      e = `${parts[1].trim().padStart(2, '0')}-${month}`;
    }
    if (s && e) {
      return `${s} to ${e}`;
    }
  }

  return trimmed;
}

/**
 * Get active pay period from localStorage or fallback to default
 */
export function getActivePayPeriod(): ActivePayPeriod {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PERIOD };
  }

  try {
    const storedStart = localStorage.getItem(STORAGE_KEY_START);
    const storedEnd = localStorage.getItem(STORAGE_KEY_END);

    return {
      start: storedStart ? normalizeSingleDate(storedStart) : DEFAULT_PERIOD.start,
      end: storedEnd ? normalizeSingleDate(storedEnd) : DEFAULT_PERIOD.end,
    };
  } catch {
    return { ...DEFAULT_PERIOD };
  }
}

/**
 * Persist active pay period and dispatch custom event for reactive updates
 */
export function setActivePayPeriod(start: string, end: string): void {
  const normStart = normalizeSingleDate(start);
  const normEnd = normalizeSingleDate(end);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_START, normStart);
      localStorage.setItem(STORAGE_KEY_END, normEnd);
      window.dispatchEvent(
        new CustomEvent(PAY_PERIOD_EVENT, {
          detail: { start: normStart, end: normEnd },
        })
      );
    } catch (e) {
      console.warn('Failed to save pay period to localStorage:', e);
    }
  }
}

/**
 * Format label e.g. "01-Sep to 07-Sep"
 */
export function formatPeriodLabel(start: string, end: string): string {
  const s = normalizeSingleDate(start);
  const e = normalizeSingleDate(end);
  if (s && e) return `${s} to ${e}`;
  if (s) return `From ${s}`;
  return '';
}

/**
 * Format compact label e.g. "01-Sep–07-Sep"
 */
export function formatPeriodCompact(start: string, end: string): string {
  const s = normalizeSingleDate(start);
  const e = normalizeSingleDate(end);
  if (s && e) return `${s}–${e}`;
  if (s) return s;
  return '';
}
