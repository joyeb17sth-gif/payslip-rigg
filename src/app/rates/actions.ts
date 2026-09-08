'use server';

import { getRates, saveRates, ContractorRate, getInvoiceRates, saveInvoiceRate, InvoiceRateItem } from '@/lib/data';
import { revalidatePath } from 'next/cache';

export async function fetchRates() {
  return await getRates();
}

export async function updateRates(rates: ContractorRate[]) {
  await saveRates(rates);
  revalidatePath('/rates');
}

export async function fetchInvoiceRates(): Promise<InvoiceRateItem[]> {
  return await getInvoiceRates();
}

export async function updateInvoiceRate(client: string, location: string, weekdays: number, weekend: number) {
  await saveInvoiceRate(client, location, weekdays, weekend);
  revalidatePath('/rates');
  revalidatePath('/payslips');
}

