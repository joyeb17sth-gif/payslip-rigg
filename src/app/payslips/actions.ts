'use server';

import { getRates, getExceptionsData, getTraining, getCompletedPayPeriods, setPayPeriodCompleted, getInvoiceRates } from '@/lib/data';

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

