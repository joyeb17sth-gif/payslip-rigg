export interface PayCycleOption {
  client: 'IHS' | 'ZBsolution' | 'All';
  type: 'Weekly' | 'Fortnightly';
  label: string;
  startFormatted: string; // e.g. "31-Aug"
  endFormatted: string;   // e.g. "06-Sep"
  fullLabel: string;
  startDate: Date;
  endDate: Date;
  periodKey: string; // e.g. "IHS-2026-09-07"
}

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  return `${day}-${month}`;
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Anchor: 31 Aug 2026 is the start of the current cycle (Monday)
// (Previous cycle was 17-Aug to 30-Aug)
const ANCHOR_MONDAY = new Date(2026, 7, 31); // 31 Aug 2026

/**
 * Given any date, find the start of the IHS weekly cycle it falls in.
 * IHS cycle: Monday to Sunday (7 days)
 */
export function getIHSCycleStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Find difference in days from anchor
  const msSinceAnchor = d.getTime() - ANCHOR_MONDAY.getTime();
  const daysSinceAnchor = Math.floor(msSinceAnchor / (1000 * 60 * 60 * 24));
  const weekOffset = Math.floor(daysSinceAnchor / 7);
  const start = new Date(ANCHOR_MONDAY);
  start.setDate(ANCHOR_MONDAY.getDate() + weekOffset * 7);
  return start;
}

/**
 * Given any date, find the start of the ZBsolution fortnightly cycle it falls in.
 * ZBsolution cycle: 14-day cycles starting from anchor Monday
 */
export function getZBCycleStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const msSinceAnchor = d.getTime() - ANCHOR_MONDAY.getTime();
  const daysSinceAnchor = Math.floor(msSinceAnchor / (1000 * 60 * 60 * 24));
  const fortnightOffset = Math.floor(daysSinceAnchor / 14);
  const start = new Date(ANCHOR_MONDAY);
  start.setDate(ANCHOR_MONDAY.getDate() + fortnightOffset * 14);
  return start;
}

/**
 * Get the current active pay periods (today's IHS weekly + ZBsolution fortnightly)
 */
export function getCurrentPayPeriods(): { ihs: PayCycleOption; zb: PayCycleOption } {
  const today = new Date();

  const ihsStart = getIHSCycleStart(today);
  const ihsEnd = new Date(ihsStart);
  ihsEnd.setDate(ihsStart.getDate() + 6);

  const zbStart = getZBCycleStart(today);
  const zbEnd = new Date(zbStart);
  zbEnd.setDate(zbStart.getDate() + 13);

  const ihs: PayCycleOption = {
    client: 'IHS',
    type: 'Weekly',
    label: `${formatDateShort(ihsStart)} to ${formatDateShort(ihsEnd)}`,
    startFormatted: formatDateShort(ihsStart),
    endFormatted: formatDateShort(ihsEnd),
    fullLabel: `IHS (Weekly): ${formatDateShort(ihsStart)} to ${formatDateShort(ihsEnd)}`,
    startDate: ihsStart,
    endDate: ihsEnd,
    periodKey: `IHS-${formatDateISO(ihsStart)}`,
  };

  const zb: PayCycleOption = {
    client: 'ZBsolution',
    type: 'Fortnightly',
    label: `${formatDateShort(zbStart)} to ${formatDateShort(zbEnd)}`,
    startFormatted: formatDateShort(zbStart),
    endFormatted: formatDateShort(zbEnd),
    fullLabel: `ZBsolution (Fortnight): ${formatDateShort(zbStart)} to ${formatDateShort(zbEnd)}`,
    startDate: zbStart,
    endDate: zbEnd,
    periodKey: `ZB-${formatDateISO(zbStart)}`,
  };

  return { ihs, zb };
}

/**
 * Get next pay period after a given one
 */
export function getNextPayPeriod(period: PayCycleOption): PayCycleOption {
  const daysToAdd = period.type === 'Weekly' ? 7 : 14;
  const nextStart = new Date(period.startDate);
  nextStart.setDate(nextStart.getDate() + daysToAdd);
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextStart.getDate() + daysToAdd - 1);

  return {
    ...period,
    label: `${formatDateShort(nextStart)} to ${formatDateShort(nextEnd)}`,
    startFormatted: formatDateShort(nextStart),
    endFormatted: formatDateShort(nextEnd),
    fullLabel: period.type === 'Weekly'
      ? `IHS (Weekly): ${formatDateShort(nextStart)} to ${formatDateShort(nextEnd)}`
      : `ZBsolution (Fortnight): ${formatDateShort(nextStart)} to ${formatDateShort(nextEnd)}`,
    startDate: nextStart,
    endDate: nextEnd,
    periodKey: `${period.client === 'IHS' ? 'IHS' : 'ZB'}-${formatDateISO(nextStart)}`,
  };
}

export function parseDateFromShort(str: string, year = 2026): Date | null {
  if (!str) return null;
  const clean = str.trim();
  // Handle ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  const parts = clean.split(/[-/\s.]+/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10);
    const mStr = parts[1].toLowerCase();
    const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(mStr.substring(0, 3)));
    if (!isNaN(day) && mIdx !== -1) {
      return new Date(year, mIdx, day);
    }
  }
  return null;
}

/**
 * Converts "2026-09-08" -> "08-Sep"
 */
export function isoToShortDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.trim().split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return formatDateShort(new Date(y, m, d));
    }
  }
  return iso;
}

/**
 * Converts "08-Sep" -> "2026-09-08"
 */
export function shortDateToISO(str: string, year = 2026): string {
  if (!str) return '';
  const clean = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const d = parseDateFromShort(clean, year);
  if (!d) return '';
  return formatDateISO(d);
}

export function generatePayPeriodSuggestions(activeStart?: string, activeEnd?: string): PayCycleOption[] {
  const suggestions: PayCycleOption[] = [];

  // If an active custom period (like 01-Sep to 07-Sep) is provided, prepend it as the primary option
  if (activeStart && activeEnd) {
    const sDate = parseDateFromShort(activeStart) || new Date(2026, 8, 1);
    const eDate = parseDateFromShort(activeEnd) || new Date(2026, 8, 7);

    suggestions.push({
      client: 'IHS',
      type: 'Weekly',
      label: `${activeStart} to ${activeEnd}`,
      startFormatted: activeStart,
      endFormatted: activeEnd,
      fullLabel: `IHS (Weekly): ${activeStart} to ${activeEnd} · Selected`,
      startDate: sDate,
      endDate: eDate,
      periodKey: `ACTIVE-IHS-${activeStart}-${activeEnd}`,
    });

    suggestions.push({
      client: 'ZBsolution',
      type: 'Fortnightly',
      label: `${activeStart} to ${activeEnd}`,
      startFormatted: activeStart,
      endFormatted: activeEnd,
      fullLabel: `ZBsolution: ${activeStart} to ${activeEnd} · Selected`,
      startDate: sDate,
      endDate: eDate,
      periodKey: `ACTIVE-ZB-${activeStart}-${activeEnd}`,
    });
  }

  // Generate current + upcoming cycles starting from the 31-Aug anchor
  for (let offset = 0; offset <= 7; offset++) {
    // IHS: Weekly (Mon - Sun)
    const ihsStart = new Date(ANCHOR_MONDAY);
    ihsStart.setDate(ANCHOR_MONDAY.getDate() + offset * 7);
    const ihsEnd = new Date(ihsStart);
    ihsEnd.setDate(ihsStart.getDate() + 6);

    const sF = formatDateShort(ihsStart);
    const eF = formatDateShort(ihsEnd);

    // Don't duplicate if already added via activeStart/activeEnd
    if (!activeStart || !activeEnd || sF !== activeStart || eF !== activeEnd) {
      suggestions.push({
        client: 'IHS',
        type: 'Weekly',
        label: `${sF} to ${eF}`,
        startFormatted: sF,
        endFormatted: eF,
        fullLabel: `IHS (Weekly): ${sF} to ${eF}`,
        startDate: ihsStart,
        endDate: ihsEnd,
        periodKey: `IHS-${formatDateISO(ihsStart)}`,
      });
    }

    // ZBsolution: Fortnightly (14-day cycles)
    if (offset % 2 === 0) {
      const zbStart = new Date(ANCHOR_MONDAY);
      zbStart.setDate(ANCHOR_MONDAY.getDate() + offset * 7);
      const zbEnd = new Date(zbStart);
      zbEnd.setDate(zbStart.getDate() + 13);

      const zSF = formatDateShort(zbStart);
      const zEF = formatDateShort(zbEnd);

      if (!activeStart || !activeEnd || zSF !== activeStart || zEF !== activeEnd) {
        suggestions.push({
          client: 'ZBsolution',
          type: 'Fortnightly',
          label: `${zSF} to ${zEF}`,
          startFormatted: zSF,
          endFormatted: zEF,
          fullLabel: `ZBsolution (Fortnight): ${zSF} to ${zEF}`,
          startDate: zbStart,
          endDate: zbEnd,
          periodKey: `ZB-${formatDateISO(zbStart)}`,
        });
      }
    }
  }

  return suggestions;
}
