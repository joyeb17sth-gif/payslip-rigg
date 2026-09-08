'use server';

import { getRates, getExceptionsData, getTraining, saveTraining, getCompletedPayPeriods, setPayPeriodCompleted, getInvoiceRates } from '@/lib/data';
import { cleanName } from '@/lib/payrollSummary';

export async function fetchPayslipContext() {
  // Run all independent queries concurrently to eliminate sequential network latency
  const [rates, exceptions, allTraining, completedPeriods, invoiceRates] = await Promise.all([
    getRates(),
    getExceptionsData(),
    getTraining(),
    getCompletedPayPeriods(),
    getInvoiceRates(),
  ]);

  // Only trainees whose pay is currently RELEASED (pending physical payout on this payslip run).
  // Trainees marked 'PAID' have already been disbursed physically and must NEVER be generated again.
  const releasedTrainees = allTraining.filter(t => t.status === 'Released');

  return { 
    rates, 
    deductions: exceptions.fixed,
    codeExceptions: exceptions.codeBased,
    onceOnlyExceptions: exceptions.onceOnly || [],
    releasedTrainees,
    completedPeriods,
    invoiceRates,
  };
}

export async function togglePeriodCompletion(periodKey: string, completed: boolean): Promise<string[]> {
  return await setPayPeriodCompleted(periodKey, completed);
}

export async function markReleasedTraineesAsPaid(traineeNames?: string[]): Promise<boolean> {
  const allTraining = await getTraining();
  const nameSet = traineeNames && traineeNames.length > 0 ? new Set(traineeNames.map(n => cleanName(n))) : null;
  let changed = false;

  for (const t of allTraining) {
    if (t.status === 'Released' && (!nameSet || nameSet.has(cleanName(t.name)) || (t.norm_name && nameSet.has(t.norm_name)))) {
      t.status = 'PAID';
      t.pay_released = true;
      changed = true;
    }
  }

  if (changed) {
    await saveTraining(allTraining);
  }
  return true;
}

