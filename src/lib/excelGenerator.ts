import * as ExcelJS from 'exceljs';
import { ContractorRate, Deduction, CodeException, OnceOnlyException } from './data';
import { calculateContractorSummaries, ProcessedRecord } from './payrollSummary';
import { generateInvoiceSummary, PayslipRecord, InvoiceRateSchedule } from './calculators';

export function buildInvoiceSummarySheet(
  wb: ExcelJS.Workbook,
  records: PayslipRecord[],
  periodStart = '',
  periodEnd = '',
  companyName = 'ZB SOLUTION',
  rateSchedule?: InvoiceRateSchedule | null,
  defaultLocation = 'Ozone',
  isIHS = false
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Invoice Summary');

  // Columns setup matching the exact layout
  ws.columns = [
    { key: 'date', width: 15 },     // A: Date
    { key: 'day', width: 8 },       // B: Day
    { key: 'staff', width: 24 },    // C: Staff
    { key: 'location', width: 26 }, // D: Location
    { key: 'hour', width: 12 },     // E: Hour
    { key: 'rate', width: 14 },     // F: Rate
    { key: 'amount', width: 16 },   // G: Amount
  ];

  // Row 1: Company Name / Header
  const r1 = ws.getCell('A1');
  r1.value = companyName;
  r1.font = { bold: true, size: 12, name: 'Segoe UI' };

  // Row 2: Period
  const r2 = ws.getCell('A2');
  let periodText = 'From Period';
  if (periodStart && periodEnd) {
    periodText = `From ${periodStart} to ${periodEnd}`;
  } else if (periodStart) {
    periodText = `From ${periodStart}`;
  }
  r2.value = periodText;
  r2.font = { bold: true, size: 11, name: 'Segoe UI' };

  // Row 4: Table Headers
  const headerRowIdx = 4;
  const headers = ['Date', 'Day', 'Staff', 'Location', 'Hour', 'Rate', 'Amount'];

  // Header styling matching screenshot: soft light blue background, thin gray borders, bold text
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF8EA9DB' }, // Accent blue matching Excel screenshot
  };
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    size: 11,
    name: 'Segoe UI',
    color: { argb: 'FF000000' },
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
    bottom: { style: 'thin', color: { argb: 'FFB0C4DE' } },
    left: { style: 'thin', color: { argb: 'FFB0C4DE' } },
    right: { style: 'thin', color: { argb: 'FFB0C4DE' } },
  };

  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRowIdx, idx + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = thinBorder;
    cell.alignment = {
      vertical: 'middle',
      horizontal: (idx === 0 || idx === 1) ? 'center' : (idx >= 4 ? 'right' : 'left'),
    };
  });

  const { items } = generateInvoiceSummary(records, periodStart, defaultLocation, rateSchedule, isIHS);
  let currentIdx = headerRowIdx + 1;
  const startDataRow = currentIdx;

  for (const item of items) {
    const cDate = ws.getCell(currentIdx, 1);
    cDate.value = item.date;
    cDate.alignment = { horizontal: 'center' };
    cDate.border = thinBorder;

    const cDay = ws.getCell(currentIdx, 2);
    cDay.value = item.day;
    cDay.alignment = { horizontal: 'center' };
    cDay.border = thinBorder;

    const cStaff = ws.getCell(currentIdx, 3);
    cStaff.value = item.staff;
    cStaff.alignment = { horizontal: 'left' };
    cStaff.border = thinBorder;

    const cLoc = ws.getCell(currentIdx, 4);
    cLoc.value = item.location;
    cLoc.alignment = { horizontal: 'left' };
    cLoc.border = thinBorder;

    const cHour = ws.getCell(currentIdx, 5);
    cHour.value = item.hour;
    cHour.numFmt = Number.isInteger(item.hour) ? '#,##0' : 'General';
    cHour.alignment = { horizontal: 'right' };
    cHour.border = thinBorder;

    const cRate = ws.getCell(currentIdx, 6);
    cRate.value = item.rate;
    cRate.numFmt = '"$"#,##0.00';
    cRate.alignment = { horizontal: 'right' };
    cRate.border = thinBorder;

    const cAmt = ws.getCell(currentIdx, 7);
    cAmt.value = item.amount;
    cAmt.numFmt = '"$"#,##0.00';
    cAmt.alignment = { horizontal: 'right' };
    cAmt.border = thinBorder;

    currentIdx++;
  }

  const endDataRow = currentIdx - 1;

  if (items.length > 0) {
    // Grand Total Row
    const totalRowIdx = currentIdx;
    
    // Label
    const cTotalLabel = ws.getCell(totalRowIdx, 4);
    cTotalLabel.value = 'GRAND TOTAL';
    cTotalLabel.font = { bold: true, size: 11, name: 'Segoe UI' };
    cTotalLabel.alignment = { horizontal: 'right' };

    // Sum of Hours
    const cTotalHours = ws.getCell(totalRowIdx, 5);
    cTotalHours.value = { formula: `SUM(E${startDataRow}:E${endDataRow})` };
    cTotalHours.numFmt = 'General';
    cTotalHours.font = { bold: true, size: 11, name: 'Segoe UI' };
    cTotalHours.alignment = { horizontal: 'right' };
    cTotalHours.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
    };

    // Blank for Rate
    const cTotalRate = ws.getCell(totalRowIdx, 6);
    cTotalRate.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
    };

    // Sum of Amount
    const cTotalAmt = ws.getCell(totalRowIdx, 7);
    cTotalAmt.value = { formula: `SUM(G${startDataRow}:G${endDataRow})` };
    cTotalAmt.numFmt = '"$"#,##0.00';
    cTotalAmt.font = { bold: true, size: 11, name: 'Segoe UI' };
    cTotalAmt.alignment = { horizontal: 'right' };
    cTotalAmt.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
    };

    // Auto-filter on the data range
    ws.autoFilter = `A${headerRowIdx}:G${endDataRow}`;
  }

  return ws;
}

export async function generateStandaloneInvoiceExcel(
  records: PayslipRecord[],
  periodStart: string,
  periodEnd: string,
  companyName = 'ZB SOLUTION',
  rateSchedule?: InvoiceRateSchedule | null,
  targetLocation = 'Ozone',
  isIHS = false
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Payslip Bot';
  wb.lastModifiedBy = 'Payslip Bot';
  wb.created = new Date();
  wb.modified = new Date();

  buildInvoiceSummarySheet(wb, records, periodStart, periodEnd, companyName, rateSchedule, targetLocation, isIHS);
  return await wb.xlsx.writeBuffer();
}

export async function generateExcel(
  data: ProcessedRecord[], 
  context: { rates: ContractorRate[]; deductions: Deduction[]; codeExceptions?: CodeException[]; onceOnlyExceptions?: OnceOnlyException[] },
  periodStart: string,
  periodEnd: string,
  rateSchedule?: InvoiceRateSchedule | null,
  targetLocation = 'Ozone',
  isIHS = false
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Payslip Bot';
  wb.lastModifiedBy = 'Payslip Bot';
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Build Invoice Summary as Sheet 1 ONLY for ZB Solution!
  // For IHS, "the invoice summery is just for zb solutions ok"
  if (!isIHS) {
    const locName = targetLocation.trim() || 'Ozone';
    const invoiceCompanyTitle = locName.toLowerCase() === 'beyond' ? 'ZB SOLUTION (BEYOND)' : `ZB SOLUTION (${locName.toUpperCase()})`;
    buildInvoiceSummarySheet(wb, data as PayslipRecord[], periodStart, periodEnd, invoiceCompanyTitle, rateSchedule, locName, false);
  }

  // 2. Location sheets with individual contractor payslip breakdowns
  const summaries = calculateContractorSummaries(data, context, periodStart, periodEnd);
  const locations = Array.from(new Set(summaries.map(s => s.location)));

  for (const loc of locations) {
    const rawClean = (loc || '').trim().replace(/[:/*?[\]]/g, '');
    const safeLoc = rawClean.substring(0, 28).trim() || 'General';
    let sheetTitle = safeLoc;
    let count = 1;
    while (wb.worksheets.some(ws => ws.name.toLowerCase() === sheetTitle.toLowerCase())) {
      sheetTitle = `${safeLoc.substring(0, 25)}_${count}`;
      count++;
    }

    const ws = wb.addWorksheet(sheetTitle);

    // Columns setup
    ws.columns = [
      { width: 20 }, // Pay Condition
      { width: 25 }, // Role
      { width: 12 }, // Code
      { width: 10 }, // Hours
      { width: 12 }, // Rate
      { width: 15 }, // Amount
    ];

    const locSummaries = summaries.filter(s => s.location === loc);
    let totalForSheet = 0.0;
    let currentRow = 2; // Start from row 2

    for (const summary of locSummaries) {
      // 1. Employee Header
      const headerCell = ws.getCell(`A${currentRow}`);
      headerCell.value = summary.name;
      headerCell.font = { bold: true, size: 12 };
      currentRow++;

      if (periodStart || periodEnd) {
        ws.getCell(`A${currentRow}`).value = 'Period';
        ws.getCell(`B${currentRow}`).value = periodStart;
        ws.getCell(`D${currentRow}`).value = periodEnd;
        currentRow += 2;
      } else {
        currentRow += 1;
      }

      // 2. Table Headers
      const headers = ["Pay Condition", "Role", "Code", "Hours", "Rate", "Amount"];
      headers.forEach((h, idx) => {
        const cell = ws.getCell(currentRow, idx + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }; // Light peach
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      currentRow++;

      // 3. Data Rows (Consolidated per Pay Condition, Role, Code, Rate for the payslip card)
      const payslipItemsMap = new Map<string, { displayPc: string; role: string; code: string; hours: number; rate: number; amount: number }>();

      for (const d of summary.records) {
        if (d.Hours <= 0) continue;
        
        const codeRaw = (d.Code || '').trim().toUpperCase();
        if (codeRaw === 'OPAL') continue; // Handled below

        let displayPc = d['Pay Condition'];
        if (d.Role.toUpperCase().includes('TRAINER') || codeRaw === 'TPR' || d.Role.toUpperCase().includes('TRAINING PAY RELEASED')) {
          displayPc = 'Training Pay';
        }

        const rateNum = d.Rate === 'Not Found' ? 0 : Number(d.Rate);
        const key = `${displayPc}|${d.Role}|${d.Code || ''}|${rateNum}`;
        if (payslipItemsMap.has(key)) {
          const item = payslipItemsMap.get(key)!;
          item.hours = Math.round((item.hours + d.Hours) * 100) / 100;
          item.amount = Math.round((item.amount + (Number(d.Total) || (d.Hours * rateNum))) * 100) / 100;
        } else {
          payslipItemsMap.set(key, {
            displayPc,
            role: d.Role,
            code: d.Code || '',
            hours: d.Hours,
            rate: rateNum,
            amount: Math.round((Number(d.Total) || (d.Hours * rateNum)) * 100) / 100,
          });
        }
      }

      for (const d of payslipItemsMap.values()) {
        const borderStyle = { style: 'thin' as const };
        const borders = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

        const cPc = ws.getCell(currentRow, 1);
        cPc.value = d.displayPc;
        cPc.border = borders;

        const cRole = ws.getCell(currentRow, 2);
        cRole.value = d.role;
        cRole.border = borders;

        const cCode = ws.getCell(currentRow, 3);
        cCode.value = d.code;
        cCode.border = borders;

        const cHours = ws.getCell(currentRow, 4);
        cHours.value = d.hours;
        cHours.border = borders;
        cHours.numFmt = Number.isInteger(d.hours) ? '#,##0' : 'General';

        const cRate = ws.getCell(currentRow, 5);
        cRate.value = d.rate;
        cRate.border = borders;
        cRate.numFmt = '"$"#,##0.00';

        const cAmt = ws.getCell(currentRow, 6);
        cAmt.value = d.amount;
        cAmt.border = borders;
        cAmt.numFmt = '"$"#,##0.00';

        currentRow++;
      }

      // OPAL calculation row
      const opalData = summary.records.filter(d => (d.Code || '').trim().toUpperCase() === 'OPAL');
      if (opalData.length > 0) {
        const opalDays = opalData.reduce((sum, d) => sum + d.Hours, 0);
        const opalAmount = opalDays * 10.0; // Flat $10 rate
        
        const cTitle = ws.getCell(currentRow, 5);
        cTitle.value = "Opal";
        cTitle.font = { bold: true };

        const cAmt = ws.getCell(currentRow, 6);
        cAmt.value = opalAmount;
        cAmt.font = { bold: true };
        cAmt.numFmt = '"$"#,##0.00';
        cAmt.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        currentRow++;
      }

      // 4. Deduction Rows (Payroll Deduction, All Pay on MOD, Exceed, Short fall pay, etc.)
      for (const ded of summary.deductions) {
        const cTitle = ws.getCell(currentRow, 5);
        cTitle.value = ded.label;
        cTitle.font = { bold: true };

        const cAmt = ws.getCell(currentRow, 6);
        cAmt.value = ded.amount;
        cAmt.font = { bold: true };
        cAmt.numFmt = '"$"#,##0.00';
        cAmt.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        currentRow++;
      }

      // 5. Net Pay Row
      const cTitle = ws.getCell(currentRow, 5);
      cTitle.value = "Net Pay";
      cTitle.font = { bold: true };

      const cAmt = ws.getCell(currentRow, 6);
      cAmt.value = summary.netPay;
      cAmt.font = { bold: true };
      cAmt.numFmt = '"$"#,##0.00';
      cAmt.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      totalForSheet += summary.netPay;
      currentRow += 3; // Gap
    }

    // Print Sheet Total at the end
    currentRow++;
    const cTotalLabel = ws.getCell(currentRow, 4);
    cTotalLabel.value = "Total";
    cTotalLabel.font = { bold: true };

    const cTotal = ws.getCell(currentRow, 5);
    cTotal.value = Math.round(totalForSheet * 100) / 100;
    cTotal.font = { bold: true };
    cTotal.numFmt = '"$"#,##0.00';
    cTotal.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
