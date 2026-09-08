import { fetchRates, fetchInvoiceRates } from './actions';
import RatesClient from './RatesClient';

export default async function RatesPage() {
  const [initialRates, initialInvoiceRates] = await Promise.all([
    fetchRates(),
    fetchInvoiceRates(),
  ]);

  return <RatesClient initialRates={initialRates} initialInvoiceRates={initialInvoiceRates} />;
}
