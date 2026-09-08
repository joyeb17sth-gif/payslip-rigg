export const dynamic = 'force-dynamic';

import { fetchPayslipContext } from './actions';
import PayslipsClient from './PayslipsClient';

export default async function PayslipsPage() {
  const context = await fetchPayslipContext();

  return <PayslipsClient context={context} />;
}
