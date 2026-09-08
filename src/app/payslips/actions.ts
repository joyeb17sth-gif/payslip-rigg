'use server';

import { getRates, getExceptionsData, getTraining, getCompletedPayPeriods, setPayPeriodCompleted, getInvoiceRates } from '@/lib/data';

export async function fetchPayslipContext() {
  const rates = await getRates();
  const exceptions = await getExceptionsData();
  const allTraining = await getTraining();
  const completedPeriods = await getCompletedPayPeriods();
  const invoiceRates = await getInvoiceRates();
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

