import { Deduction, CodeException, OnceOnlyException } from './data';
import { PayslipRecord } from './calculators';

export interface ProcessedRecord extends PayslipRecord {
  Rate: number | string;
  Total: number;
}

export interface ContractorDeductionDetail {
  type: 'fixed' | 'code' | 'once_only';
  label: string;
  amount: number; // Negative for deductions, positive for allowances/additions
}

export interface ContractorSummary {
  name: string;
  cleanName: string;
  location: string;
  totalHours: number;
  grossPay: number;
  opalDays?: number;
  opalAmount?: number;
  deductions: ContractorDeductionDetail[];
  totalDeductions: number;
  netPay: number;
  uncollectedDeductions?: number;
  records: ProcessedRecord[];
}

export function cleanName(str: string): string {
  return (str || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function locMatches(locA?: string, locB?: string): boolean {
  if (!locA || !locB || locA === 'All' || locB === 'All') return true;
  const a = cleanName(locA);
  const b = cleanName(locB);
  return a === b || a.includes(b) || b.includes(a);
}

import { normalizePayPeriodString, normalizeSingleDate, splitPeriodRange } from './payPeriodStorage';
import { parseDateFromShort } from './payPeriods';

export function matchesPayPeriod(excPeriod?: string, start?: string, end?: string): boolean {
  if (!excPeriod || excPeriod === 'All' || !start || !end) return true;

  const normExc = normalizePayPeriodString(excPeriod);
  const normStart = normalizeSingleDate(start);
  const normEnd = normalizeSingleDate(end);

  const pNorm = cleanName(normExc);
  const currentKey = cleanName(`${normStart} to ${normEnd}`);
  const currentKeyHyphen = cleanName(`${normStart} - ${normEnd}`);

  if (
    pNorm === currentKey ||
    pNorm === currentKeyHyphen ||
    pNorm.includes(cleanName(normStart)) ||
    currentKey.includes(pNorm)
  ) {
    return true;
  }

  // Check date overlap or single date containment
  const excParts = splitPeriodRange(normExc);
  const cStart = parseDateFromShort(normStart);
  const cEnd = parseDateFromShort(normEnd);

  if (cStart && cEnd) {
    if (excParts.length === 2) {
      const eStart = parseDateFromShort(excParts[0]);
      const eEnd = parseDateFromShort(excParts[1]);

      if (eStart && eEnd) {
        const latestStart = Math.max(eStart.getTime(), cStart.getTime());
        const earliestEnd = Math.min(eEnd.getTime(), cEnd.getTime());
        // If they overlap with the pay cycle, they match
        if (latestStart <= earliestEnd) {
          return true;
        }
      }
    } else if (excParts.length === 1) {
      // Single date in between (e.g. "04-Sep")
      const singleDate = parseDateFromShort(excParts[0]);
      if (singleDate) {
        if (singleDate.getTime() >= cStart.getTime() && singleDate.getTime() <= cEnd.getTime()) {
          return true;
        }
      }
    }
  }

  return false;
}

export interface PayslipCalculationContext {
  deductions?: Deduction[];
  codeExceptions?: CodeException[];
  onceOnlyExceptions?: OnceOnlyException[];
}

export function calculateContractorSummaries(
  records: ProcessedRecord[],
  context: PayslipCalculationContext,
  periodStart?: string,
  periodEnd?: string
): ContractorSummary[] {
  const summaries: ContractorSummary[] = [];

  // Determine each contractor's primary location (site with highest gross pay)
  // Global/Fixed deductions set to "All" will only attach to their primary location to prevent double-deduction
  const contractorLocGross = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.Hours <= 0) continue;
    const cName = cleanName(r['Sub Contractor']);
    if (!contractorLocGross.has(cName)) contractorLocGross.set(cName, new Map());
    const m = contractorLocGross.get(cName)!;
    m.set(r.Location, (m.get(r.Location) || 0) + (Number(r.Total) || 0));
  }

  const contractorPrimaryLoc = new Map<string, string>();
  for (const [cName, locMap] of contractorLocGross.entries()) {
    let maxG = -1;
    let bestLoc = '';
    for (const [l, g] of locMap.entries()) {
      if (g > maxG) {
        maxG = g;
        bestLoc = l;
      }
    }
    contractorPrimaryLoc.set(cName, bestLoc);
  }

  const locations = Array.from(new Set(records.map(r => r.Location))).sort();

  for (const loc of locations) {
    const locRecords = records.filter(r => r.Location === loc);
    const contractorNames = Array.from(new Set(locRecords.map(r => r['Sub Contractor']))).sort();

    for (const emp of contractorNames) {
      const empData = locRecords.filter(r => r['Sub Contractor'] === emp);
      const cleanEmp = cleanName(emp);
      const isPrimarySite = loc === (contractorPrimaryLoc.get(cleanEmp) || loc);

      let grossPay = 0;
      let totalHours = 0;

      for (const d of empData) {
        if (d.Hours <= 0) continue;
        const codeRaw = (d.Code || '').trim().toUpperCase();
        if (codeRaw === 'OPAL') continue; // OPAL calculated separately below
        totalHours += d.Hours;
        grossPay += Number(d.Total) || 0;
      }

      // OPAL calculation: $10/day
      const opalData = empData.filter(d => (d.Code || '').trim().toUpperCase() === 'OPAL');
      let opalDays = 0;
      let opalAmount = 0;
      if (opalData.length > 0) {
        opalDays = opalData.reduce((sum, d) => sum + d.Hours, 0);
        opalAmount = opalDays * 10.0;
        grossPay += opalAmount;
      }

      const deductionsList: ContractorDeductionDetail[] = [];

      // 1. Code-based Exceptions (e.g. ALL_PAY_MOD)
      const codeExcs = context.codeExceptions || [];
      const empCodeExc =
        codeExcs.find(c => cleanName(c.name) === cleanEmp && c.location !== 'All' && locMatches(c.location, loc)) ||
        (isPrimarySite ? codeExcs.find(c => cleanName(c.name) === cleanEmp && (!c.location || c.location === 'All')) : undefined);

      if (empCodeExc) {
        const targetCode = (empCodeExc.code || 'MOD').trim().toUpperCase();
        let targetCodePay = 0;

        for (const d of empData) {
          if (d.Hours <= 0) continue;
          const codeRaw = (d.Code || '').trim().toUpperCase();
          if (codeRaw === 'OPAL') continue;
          if (codeRaw === targetCode || (d.Role || '').toUpperCase().includes(targetCode)) {
            targetCodePay += Number(d.Total) || 0;
          }
        }

        let deductionAmt = 0;
        if (empCodeExc.rule === 'DEDUCT_EXCEPT_CODE') {
          deductionAmt = Math.max(0, grossPay - targetCodePay);
        } else if (empCodeExc.rule === 'DEDUCT_SPECIFIC_CODE') {
          deductionAmt = targetCodePay;
        }

        if (deductionAmt > 0) {
          deductionsList.push({
            type: 'code',
            label: empCodeExc.code ? `All Pay except ${empCodeExc.code}` : 'All Pay on MOD',
            amount: -Math.abs(deductionAmt),
          });
        }
      } else {
        // 2. Fixed Amount Exceptions (Global deductions applied only once to primary site)
        const fixedList = context.deductions || [];
        const siteSpecificDed = fixedList.find(d => cleanName(d.name) === cleanEmp && d.location !== 'All' && locMatches(d.location, loc));
        const globalDed = isPrimarySite ? fixedList.find(d => cleanName(d.name) === cleanEmp && (!d.location || d.location === 'All')) : undefined;
        const empDed = siteSpecificDed || globalDed;

        if (empDed && empDed.amount !== 0) {
          deductionsList.push({
            type: 'fixed',
            label: 'Payroll Deduction',
            amount: -Math.abs(empDed.amount),
          });
        }
      }

      // 3. Once-Only Exceptions (Short fall pay, Exceed, etc.)
      const onceList = context.onceOnlyExceptions || [];
      const empOnce = onceList.filter(e => {
        if (cleanName(e.name) !== cleanEmp) return false;
        const isGlobal = !e.location || e.location === 'All';
        if (isGlobal && !isPrimarySite) return false;
        if (!isGlobal && !locMatches(e.location, loc)) return false;
        if (e.payPeriod && !matchesPayPeriod(e.payPeriod, periodStart, periodEnd)) return false;
        return true;
      });

      for (const exc of empOnce) {
        deductionsList.push({
          type: 'once_only',
          label: exc.type || 'Adjustment',
          amount: exc.amount,
        });
      }

      const totalDeductions = deductionsList.reduce((sum, d) => sum + d.amount, 0);
      const rawNet = Math.round((grossPay + totalDeductions) * 100) / 100;
      
      // Fix 4: If deductions exceed gross pay, cap net pay at $0.00 and track uncollected deduction balance
      let netPay = rawNet;
      let uncollectedDeductions = 0;
      if (rawNet < 0) {
        netPay = 0.00;
        uncollectedDeductions = Math.round(Math.abs(rawNet) * 100) / 100;
      }

      summaries.push({
        name: emp,
        cleanName: cleanEmp,
        location: loc,
        totalHours: Math.round(totalHours * 100) / 100,
        grossPay: Math.round(grossPay * 100) / 100,
        opalDays: opalDays > 0 ? opalDays : undefined,
        opalAmount: opalAmount > 0 ? opalAmount : undefined,
        deductions: deductionsList,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        netPay,
        uncollectedDeductions: uncollectedDeductions > 0 ? uncollectedDeductions : undefined,
        records: empData,
      });
    }
  }

  return summaries;
}
