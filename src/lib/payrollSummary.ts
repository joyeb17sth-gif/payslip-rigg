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

export function matchesPayPeriod(excPeriod?: string, start?: string, end?: string): boolean {
  if (!excPeriod || excPeriod === 'All' || !start || !end) return true;
  const pNorm = cleanName(excPeriod);
  const currentKey = cleanName(`${start} to ${end}`);
  const currentKeyHyphen = cleanName(`${start} - ${end}`);
  return (
    pNorm === currentKey ||
    pNorm === currentKeyHyphen ||
    pNorm.includes(cleanName(start)) ||
    currentKey.includes(pNorm)
  );
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
  const locations = Array.from(new Set(records.map(r => r.Location))).sort();

  for (const loc of locations) {
    const locRecords = records.filter(r => r.Location === loc);
    const contractorNames = Array.from(new Set(locRecords.map(r => r['Sub Contractor']))).sort();

    for (const emp of contractorNames) {
      const empData = locRecords.filter(r => r['Sub Contractor'] === emp);
      const cleanEmp = cleanName(emp);

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
        codeExcs.find(c => cleanName(c.name) === cleanEmp && locMatches(c.location, loc)) ||
        codeExcs.find(c => cleanName(c.name) === cleanEmp && (!c.location || c.location === 'All'));

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
          // Deduct everything except targetCode pay
          deductionAmt = Math.max(0, grossPay - targetCodePay);
        } else if (empCodeExc.rule === 'DEDUCT_SPECIFIC_CODE') {
          // Deduct only targetCode pay
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
        // 2. Fixed Amount Exceptions
        const fixedList = context.deductions || [];
        const empDed =
          fixedList.find(d => cleanName(d.name) === cleanEmp && locMatches(d.location, loc)) ||
          fixedList.find(d => cleanName(d.name) === cleanEmp && (!d.location || d.location === 'All'));

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
        if (e.location && e.location !== 'All' && !locMatches(e.location, loc)) return false;
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
      const netPay = Math.round((grossPay + totalDeductions) * 100) / 100;

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
        records: empData,
      });
    }
  }

  return summaries;
}
