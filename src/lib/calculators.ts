import * as XLSX from 'xlsx';

export interface TimesheetRow {
  Date?: string | Date;
  'First Name'?: string;
  Surname?: string;
  Location?: string;
  Role?: string;
  'Pay Condition'?: string;
  Duration?: string | number;
  // Fallbacks for generic timesheet headers
  name?: string;
  date?: string;
  hours?: number;
}

export interface PayslipRecord {
  'Timesheet date': string;
  Location: string;
  'Sub Contractor': string;
  Role: string;
  'Pay Condition': string; // This will hold the parsed day_type
  Code: string;
  pc_raw: string;
  Hours: number;
  Rate?: string | number;
  Total?: string | number;
}

export interface HoursRecord {
  name: string;
  role: string;
  date: string;
  start: string;
  end: string;
  hours: number;
}

export function parseTimeStr(tStr: any): { str: string; hoursTotal: number | null } | null {
  if (tStr === undefined || tStr === null) return null;
  if (typeof tStr === 'number') {
    const totalSecs = Math.round(tStr * 86400);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return { str: `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`, hoursTotal: h + m / 60 };
  }
  const s = String(tStr).trim().toLowerCase().replace(/\s+/g, '');
  if (!s || s === 'na' || s === 'nan' || s === '-') return null;

  // Match 10am, 2.30pm, 10:00am, etc.
  const match12 = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const isPm = match12[3] === 'pm';
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return { str: `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`, hoursTotal: h + m / 60 };
  }

  // Match 14:30:00 or 14:30 or 9:00:00 or 9:00
  const match24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return { str: `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`, hoursTotal: h + m / 60 };
  }

  return { str: String(tStr).trim(), hoursTotal: null };
}

export function normalizeDateStr(val: any): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  const s = String(val).split(' ')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  const slashParts = s.split(/[\/\-]/);
  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
    const p0 = parseInt(slashParts[0], 10);
    const p1 = parseInt(slashParts[1], 10);
    let y = slashParts[2];
    if (y.length === 2) {
      y = parseInt(y, 10) > 50 ? `19${y}` : `20${y}`;
    }
    // If p0 > 12, it must be DD/MM/YYYY
    if (p0 > 12) {
      return `${y}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
    }
    // If p1 > 12, it must be MM/DD/YYYY
    if (p1 > 12) {
      return `${y}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // Default US/Deputy format MM/DD/YYYY
    return `${y}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return s;
}

export function parseHoursTimesheet(buffer: ArrayBuffer, filename?: string): HoursRecord[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 1. Check for Matrix / Roster format ('DAY' row)
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  let dayRowIdx = -1;
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const row = grid[r];
    if (row && row.length > 0 && String(row[0]).trim().toUpperCase() === 'DAY') {
      dayRowIdx = r;
      break;
    }
  }

  if (dayRowIdx !== -1 && dayRowIdx + 1 < grid.length) {
    const datesRow = grid[dayRowIdx + 1];
    const colToDate: Record<number, string> = {};
    for (let c = 1; c < datesRow.length; c++) {
      const d = String(datesRow[c] || '').trim();
      if (d && d !== 'nan' && d !== 'null') {
        colToDate[c] = normalizeDateStr(d);
      }
    }

    const records: HoursRecord[] = [];
    let currentRole = '';

    for (let r = dayRowIdx + 2; r < grid.length; r++) {
      const row = grid[r];
      if (!row || !row[0]) continue;
      const nameCol = String(row[0]).trim();
      if (!nameCol || nameCol.toLowerCase() === 'nan') continue;

      let hasTimes = false;
      const rowRecords: HoursRecord[] = [];

      for (let c = 1; c < row.length; c++) {
        if (!colToDate[c]) continue;
        const date = colToDate[c];
        const val = String(row[c] || '').trim();
        if (!val || val.toLowerCase() === 'na' || val.toLowerCase() === 'nan') continue;

        const parts = val.toLowerCase().split(/[\s\-to]+/g).filter(Boolean);
        if (parts.length >= 2) {
          const st = parseTimeStr(parts[0]);
          const et = parseTimeStr(parts[parts.length - 1]);
          if (st && et && st.hoursTotal !== null && et.hoursTotal !== null) {
            hasTimes = true;
            let diff = et.hoursTotal - st.hoursTotal;
            if (diff < 0) diff += 24;
            rowRecords.push({
              name: nameCol.replace(/\s+nan\b/gi, '').replace(/\bnan\s+/gi, '').replace(/\s+/g, ' ').trim(),
              role: '',
              date: date,
              start: st.str,
              end: et.str,
              hours: Math.round(diff * 100) / 100
            });
          }
        }
      }

      if (!hasTimes) {
        if (nameCol.split(/\s+/).length > 1 || nameCol.includes('(')) {
          currentRole = nameCol;
        }
      } else {
        for (const rec of rowRecords) {
          rec.role = currentRole;
          records.push(rec);
        }
      }
    }
    return records;
  }

  // 2. Standard or Tabular formats (Deputy, Payslip, Calculated CSV)
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  if (!rows || rows.length === 0) return [];

  const records: HoursRecord[] = [];
  for (const rawRow of rows) {
    const row: Record<string, any> = {};
    for (const k in rawRow) {
      row[k.trim().toLowerCase()] = rawRow[k];
    }

    // Extract Name
    let name = '';
    if (row['name']) name = String(row['name']);
    else if (row['sub contractor']) name = String(row['sub contractor']);
    else if (row['contractor']) name = String(row['contractor']);
    else if (row['employee']) name = String(row['employee']);
    else if (row['first name']) {
      const first = String(row['first name'] || '');
      const last = String(row['surname'] || row['last name'] || '');
      name = `${first} ${last}`.trim();
    }
    name = name.replace(/\s+nan\b/gi, '').replace(/\bnan\s+/gi, '').replace(/\s+/g, ' ').trim();
    if (!name || name.toLowerCase() === 'nan') continue;

    // Extract Role
    let role = String(row['role'] || row['position'] || row['designation'] || '').trim();
    if (role.toLowerCase() === 'nan') role = '';

    // Extract Date
    const dateVal = row['date'] || row['timesheet date'] || row['start date'] || row['shift date'];
    const dateStr = normalizeDateStr(dateVal);

    // Extract Start / End
    const startVal = row['start'] || row['start time'] || row['timesheet start time'];
    const endVal = row['end'] || row['end time'] || row['timesheet end time'];
    const parsedStart = parseTimeStr(startVal);
    const parsedEnd = parseTimeStr(endVal);
    const startStr = parsedStart ? parsedStart.str : (startVal ? String(startVal).trim() : '-');
    const endStr = parsedEnd ? parsedEnd.str : (endVal ? String(endVal).trim() : '-');

    // Extract Hours
    let hours = 0;
    const hoursVal = row['hours'] || row['duration'] || row['total hours'] || row['hours worked'];
    if (hoursVal) {
      const strH = String(hoursVal).trim();
      if (strH && strH.toLowerCase() !== 'nan') {
        if (strH.includes(':')) {
          const parts = strH.split(':');
          hours = Math.round((parseFloat(parts[0]) + parseFloat(parts[1] || '0') / 60) * 100) / 100;
        } else {
          hours = Math.round(parseFloat(strH) * 100) / 100 || 0;
        }
      }
    }

    // Fallback: calculate hours from start and end if hours is 0
    if (hours === 0 && parsedStart && parsedEnd && parsedStart.hoursTotal !== null && parsedEnd.hoursTotal !== null) {
      let diff = parsedEnd.hoursTotal - parsedStart.hoursTotal;
      if (diff < 0) diff += 24;
      hours = Math.round(diff * 100) / 100;
    }

    if (hours > 0) {
      records.push({
        name,
        role,
        date: dateStr,
        start: startStr,
        end: endStr,
        hours
      });
    }
  }

  return records;
}

export function parseFileBuffer(buffer: ArrayBuffer, filename: string): any[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 1. Check for Matrix / Grid Timesheet format (e.g. date columns row + day row + cleaner rows)
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  let datesRowIdx = -1;
  let daysRowIdx = -1;

  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r];
    if (!row) continue;
    const dateCount = row.filter(c => /^\d{1,2}\s+[A-Za-z]{3}/.test(String(c || '').trim())).length;
    if (dateCount >= 4) datesRowIdx = r;
    const dayCount = row.filter(c => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(String(c || '').trim().toLowerCase())).length;
    if (dayCount >= 4) daysRowIdx = r;
  }

  if (datesRowIdx !== -1 && daysRowIdx !== -1) {
    const datesRow = grid[datesRowIdx];
    const daysRow = grid[daysRowIdx];
    const colDates: Record<number, { date: string; day: string }> = {};

    for (let c = 0; c < datesRow.length; c++) {
      const dStr = String(datesRow[c] || '').trim();
      const dayStr = String(daysRow[c] || '').trim();
      if (dStr && /^\d{1,2}\s+[A-Za-z]{3}/.test(dStr)) {
        colDates[c] = { date: dStr, day: dayStr };
      }
    }

    const gridRecords: any[] = [];
    let currentEmp = '';

    for (let r = Math.max(datesRowIdx, daysRowIdx) + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || row.length === 0) continue;
      const col0 = String(row[0] || '').trim();
      const col1 = String(row[1] || '').trim();

      let shiftCondition = 'Mon - Fri';
      if (col0.toLowerCase().startsWith('cleaner')) {
        currentEmp = col1 || col0.replace(/cleaner\s*[\d\-]+\s*/i, '').trim();
      } else if (col0.toLowerCase() === 'saturday') {
        shiftCondition = 'Saturday';
      } else if (col0.toLowerCase() === 'sunday') {
        shiftCondition = 'Sunday';
      } else if (col0.toLowerCase().includes('public holiday')) {
        shiftCondition = 'Public Holidays';
      } else if (!col0 && !col1) {
        continue;
      }

      if (!currentEmp) continue;

      for (const [colIdxStr, dateInfo] of Object.entries(colDates)) {
        const c = parseInt(colIdxStr, 10);
        const cellVal = String(row[c] || '').trim();
        if (!cellVal || cellVal === '-' || cellVal === '$0.00') continue;
        const hoursNum = parseFloat(cellVal.replace(/[^0-9.]/g, ''));
        if (!isNaN(hoursNum) && hoursNum > 0) {
          gridRecords.push({
            'Sub Contractor': currentEmp,
            'Role': 'Cleaner',
            'Timesheet date': `${dateInfo.date}-26`,
            'Pay Condition': shiftCondition,
            'Hours': hoursNum,
          });
        }
      }
    }

    if (gridRecords.length > 0) {
      return gridRecords;
    }
  }

  // 2. Standard tabular formats
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);
  // Sanitize: convert Date instances to ISO strings so rows are plain serialisable objects
  return rows.map(row => {
    const clean: Record<string, unknown> = {};
    for (const key in row) {
      const v = row[key];
      clean[key] = v instanceof Date ? v.toISOString().split('T')[0] : v;
    }
    return clean;
  });
}

export interface InvoiceSummaryItem {
  date: string;
  day: string;
  staff: string;
  location: string;
  hour: number;
  rate: number;
  amount: number;
  rawDateTimestamp?: number;
}

export function parsePeriodDate(str: string): Date | null {
  if (!str) return null;
  const s = String(str).trim();
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  
  // Match YYYY-MM-DD (e.g. 2026-08-17 from 123.csv)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const yr = parseInt(isoMatch[1], 10);
    const mo = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(yr, mo, day);
  }

  // Match DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const mo = parseInt(dmyMatch[2], 10) - 1;
    let yr = parseInt(dmyMatch[3], 10);
    if (yr < 100) yr = 2000 + yr;
    return new Date(yr, mo, day);
  }

  // Match formats like 17-Aug-26, 17-Aug, 17 Aug, 3-Aug-26
  const mMatch = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[\s\-]?(\d{2,4})?$/i);
  if (mMatch) {
    const day = parseInt(mMatch[1], 10);
    const mIdx = months[mMatch[2].toLowerCase()];
    let yr = mMatch[3] ? parseInt(mMatch[3], 10) : new Date().getFullYear();
    if (yr < 100) yr = 2000 + yr;
    if (mIdx !== undefined) return new Date(yr, mIdx, day);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatInvoiceDate(
  val: any,
  fallbackPeriodDate?: string,
  payCondition?: string
): { dateStr: string; dayStr: string; timestamp: number } {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let d: Date | null = null;
  if (val) {
    if (val instanceof Date && !isNaN(val.getTime())) {
      d = val;
    } else if (typeof val === 'number') {
      d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
      const s = String(val).trim().split(' ')[0];
      const parsed = parsePeriodDate(s);
      if (parsed) d = parsed;
    }
  }

  // If no date found from val, use fallbackPeriodDate with day offset
  if (!d || isNaN(d.getTime())) {
    if (fallbackPeriodDate) {
      const baseDate = parsePeriodDate(fallbackPeriodDate);
      if (baseDate) {
        d = new Date(baseDate.getTime());
        const pc = String(payCondition || '').toUpperCase();
        const baseDay = d.getDay(); // 1 = Mon
        if (pc.includes('SAT')) {
          const offset = (6 - baseDay + 7) % 7;
          d.setDate(d.getDate() + (offset === 0 ? 0 : offset));
        } else if (pc.includes('SUN')) {
          const offset = (0 - baseDay + 7) % 7;
          d.setDate(d.getDate() + (offset === 0 ? 7 : offset));
        }
      }
    }
  }

  if (!d || isNaN(d.getTime())) {
    const rawStr = String(val || fallbackPeriodDate || '');
    return { dateStr: rawStr, dayStr: '', timestamp: 0 };
  }

  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];
  const yearShort = String(d.getFullYear()).slice(-2);

  return {
    dateStr: `${dayNum}-${monthName}-${yearShort}`,
    dayStr: dayName,
    timestamp: d.getTime(),
  };
}

export interface InvoiceRateSchedule {
  weekdays?: number;
  weekend?: number;
}

export function generateInvoiceSummary(
  records: PayslipRecord[],
  fallbackPeriodDate = '',
  defaultLocation = '',
  rateSchedule?: InvoiceRateSchedule | null,
  isIHS = false
): { items: InvoiceSummaryItem[]; totalHours: number; totalAmount: number } {
  const items: InvoiceSummaryItem[] = [];

  for (const r of records) {
    if (r.Hours <= 0) continue;
    const { dateStr, dayStr, timestamp } = formatInvoiceDate(r['Timesheet date'], fallbackPeriodDate, r['Pay Condition']);
    const staff = (r['Sub Contractor'] || '').replace(/\s+nan\b/gi, '').replace(/\bnan\s+/gi, '').replace(/\s+/g, ' ').trim();
    
    // For IHS: ALWAYS preserve each row's dynamic location directly from the timesheet CSV!
    // For ZB Solution: if defaultLocation is provided, use it across rows.
    let location = r.Location || 'Site';
    if (!isIHS && defaultLocation && defaultLocation.trim()) {
      location = defaultLocation.trim();
    }

    let fallbackDay = dayStr;
    if (!fallbackDay) {
      const pc = String(r['Pay Condition'] || '').toUpperCase();
      if (pc.includes('SAT')) fallbackDay = 'Sat';
      else if (pc.includes('SUN')) fallbackDay = 'Sun';
      else fallbackDay = 'Mon';
    }

    // Determine Rate:
    // If rateSchedule is provided and not IHS, use client invoice rate; otherwise use contractor rate
    let rate = typeof r.Rate === 'number' ? r.Rate : (parseFloat(String(r.Rate)) || 0);
    if (rateSchedule && !isIHS) {
      const isWeekend = fallbackDay === 'Sat' || fallbackDay === 'Sun' || String(r['Pay Condition'] || '').toUpperCase().includes('SAT') || String(r['Pay Condition'] || '').toUpperCase().includes('SUN');
      if (isWeekend && typeof rateSchedule.weekend === 'number' && rateSchedule.weekend > 0) {
        rate = rateSchedule.weekend;
      } else if (!isWeekend && typeof rateSchedule.weekdays === 'number' && rateSchedule.weekdays > 0) {
        rate = rateSchedule.weekdays;
      }
    }

    const amount = Math.round(r.Hours * rate * 100) / 100;

    items.push({
      date: dateStr,
      day: fallbackDay,
      staff,
      location,
      hour: r.Hours,
      rate,
      amount,
      rawDateTimestamp: timestamp || 0,
    });
  }

  // Sort chronologically by date timestamp, then by staff name
  items.sort((a, b) => {
    if ((a.rawDateTimestamp || 0) !== (b.rawDateTimestamp || 0)) {
      return (a.rawDateTimestamp || 0) - (b.rawDateTimestamp || 0);
    }
    return a.staff.localeCompare(b.staff);
  });

  const totalHours = Math.round(items.reduce((sum, it) => sum + it.hour, 0) * 100) / 100;
  const totalAmount = Math.round(items.reduce((sum, it) => sum + it.amount, 0) * 100) / 100;

  return { items, totalHours, totalAmount };
}

export function generatePayslips(rawData: any[], defaultLocation = ''): PayslipRecord[] {
  const records: PayslipRecord[] = [];

  for (const row of rawData) {
    // Universal name and date detection (Deputy, Timesheet CSV, Exported sheet)
    const rawName = row['Sub Contractor'] || row['sub contractor'] || row['name'] || row['Name'] || 
                    row['Contractor'] || row['contractor'] || row['Staff'] || row['staff'] || 
                    (row['First Name'] ? `${row['First Name']} ${row['Surname'] || ''}` : '');
    const dateVal = row['Date'] || row['date'] || row['Start Date'] || row['start date'] || 
                    row['Timesheet date'] || row['timesheet date'];
    const durationVal = row['Duration'] ?? row['duration'] ?? row['Hours'] ?? row['hours'] ?? row['total hours'];

    const name = String(rawName || '').replace(/\s+nan\b/gi, '').replace(/\bnan\s+/gi, '').replace(/\s+/g, ' ').trim();
    if (!name || name.toLowerCase() === 'nan') continue;

    // Parse Duration
    let hours = 0.0;
    const duration = String(durationVal ?? '').trim();
    if (duration && duration !== 'nan') {
      const parts = duration.split(':');
      if (parts.length >= 2) {
        hours = Math.round((parseFloat(parts[0]) + parseFloat(parts[1]) / 60) * 100) / 100;
      } else {
        hours = parseFloat(duration) || 0;
      }
    }
    if (hours <= 0) continue;

    let location = String(row['Location'] || row['location'] || row['Site'] || row['site'] || defaultLocation || '').trim();
    let role = String(row['Role'] || row['role'] || '').trim();
    let payCondition = String(row['Pay Condition'] || row['pay condition'] || '').trim();
    const code = String(row['Code'] || row['code'] || '').trim();

    // Parse Date
    const dateStr = normalizeDateStr(dateVal);

    // Apply Location and Role overrides
    if (location.includes("(C)")) role = "Chef";
    if (location.includes("(S)")) role = "Stewarding";
    if (role === "MOD") payCondition = "MOD";

    // Date logic for dayType
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) {
      const day = dt.getDay(); // 0 = Sun, 6 = Sat
      if (!payCondition) {
        if (day === 6) payCondition = "Saturday";
        else if (day === 0) payCondition = "Sunday";
        else payCondition = "Mon - Fri";
      } else {
        if (payCondition === "OPH" && (day === 0 || day === 6)) {
          payCondition = "Sat-Sun-OPH";
        }
        if (payCondition.includes("Mon - Fri")) {
          if (day === 6) payCondition = "Saturday";
          if (day === 0) payCondition = "Sunday";
        }
      }
    } else if (!payCondition) {
      payCondition = "Mon - Fri";
    }

    records.push({
      'Timesheet date': dateStr,
      Location: location,
      'Sub Contractor': name,
      Role: role,
      'Pay Condition': payCondition,
      Code: code,
      pc_raw: payCondition,
      Hours: hours
    });
  }

  // Parse Pay Condition and Code matching legacy python logic
  for (const r of records) {
    let name = r['Sub Contractor'];
    let extractedCode = "";
    
    // Extract code from name if present in parentheses (e.g. "DIPDAS (PT2)")
    const match = name.match(/\((.*?)\)/);
    if (match) {
      extractedCode = match[1].trim().toUpperCase();
      name = name.replace(/\s*\(.*?\)/, '').trim();
      r['Sub Contractor'] = name;
    }
    
    const role = r.Role;
    const pcRaw = r.pc_raw || r['Pay Condition'];
    r.pc_raw = pcRaw;
    
    let code = "";
    let dayType = "Mon - Fri";
    const pcUpper = pcRaw.toUpperCase();
    
    if (pcUpper.includes("SAT")) dayType = "Saturday";
    else if (pcUpper.includes("SUN")) dayType = "Sunday";
    else if (pcUpper.includes("PUBLIC HOLIDAY")) dayType = "Public Holidays";
    
    if (pcUpper.includes("SA 7-0") || role.toUpperCase().includes("SA 7-0") || extractedCode.includes("SA 7-0")) {
      code = "SA 7-0";
      dayType = "Allowance";
    } else if (pcUpper.includes("SA 0-7") || role.toUpperCase().includes("SA 0-7") || extractedCode.includes("SA 0-7")) {
      code = "SA 0-7";
      dayType = "Allowance";
    } else {
      const pieces = pcRaw.split(" - ");
      if (pieces.length >= 4) {
        code = pieces[2].trim();
      } else if (pieces.length === 3) {
        code = pieces[pieces.length - 1].trim();
      }
      
      if (!code) {
        if (extractedCode) {
          code = extractedCode;
        } else if (role && ["PT1", "PT2", "PT3", "PTSUP", "CAS1", "CAS2", "CAS3", "MOD"].includes(role.toUpperCase())) {
          code = role.toUpperCase();
        }
      }
    }
    
    // Check Date logic for weekends (if date falls on weekend, force dayType)
    if (r['Timesheet date']) {
      const dt = new Date(r['Timesheet date']);
      if (!isNaN(dt.getTime())) {
        const day = dt.getDay(); // 0 = Sun, 6 = Sat
        if (day === 6 && dayType === "Mon - Fri") dayType = "Saturday";
        if (day === 0 && dayType === "Mon - Fri") dayType = "Sunday";
      }
    }
    
    r['Pay Condition'] = dayType;
    r.Code = code;
  }

  // --- Opal Allowance Calculation (Q-Station Only) ---
  // Legacy bot logic: Each contractor working at Q-Station receives $10 per unique day worked
  const isQStation = (loc: string) => {
    const l = (loc || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return l.includes('QSTATION');
  };

  const qStationContractors = new Map<string, { location: string; uniqueDates: Set<string>; countFallback: number }>();

  for (const r of records) {
    if (isQStation(r.Location) && r.Hours > 0) {
      const name = r['Sub Contractor'];
      if (!qStationContractors.has(name)) {
        qStationContractors.set(name, { location: r.Location, uniqueDates: new Set(), countFallback: 0 });
      }
      const entry = qStationContractors.get(name)!;
      if (r['Timesheet date']) {
        entry.uniqueDates.add(r['Timesheet date']);
      } else {
        entry.countFallback++;
      }
    }
  }

  for (const [name, info] of qStationContractors.entries()) {
    const daysWorked = info.uniqueDates.size > 0 ? info.uniqueDates.size : Math.max(1, info.countFallback);
    const opalDate = Array.from(info.uniqueDates)[0] || '';
    records.push({
      'Timesheet date': opalDate,
      Location: info.location,
      'Sub Contractor': name,
      Role: 'Allowance',
      'Pay Condition': 'Opal Fee',
      Code: 'OPAL',
      pc_raw: 'OPAL',
      Hours: daysWorked,
    });
  }

  // Preserve each and every individual shift/day record directly from the timesheet CSV
  return records;
}
