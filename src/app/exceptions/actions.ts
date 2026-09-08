'use server';

import { getExceptionsData, saveExceptionsData, ExceptionsData, Deduction, getDeductions, saveDeductions, ContractorDirectory, getContractorDirectory } from '@/lib/data';
import { revalidatePath } from 'next/cache';

export async function fetchExceptions(): Promise<ExceptionsData> {
  return await getExceptionsData();
}

export async function fetchContractorDirectory(): Promise<ContractorDirectory> {
  return await getContractorDirectory();
}

export async function updateExceptions(data: ExceptionsData): Promise<boolean> {
  const result = await saveExceptionsData(data);
  revalidatePath('/exceptions');
  revalidatePath('/payslips');
  return result;
}

// Backward compatibility helpers
export async function fetchDeductions(): Promise<Deduction[]> {
  return await getDeductions();
}

export async function updateDeductions(deductions: Deduction[]) {
  await saveDeductions(deductions);
  revalidatePath('/exceptions');
  revalidatePath('/payslips');
}
