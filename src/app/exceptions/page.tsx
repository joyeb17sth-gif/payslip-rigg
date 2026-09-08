import { fetchExceptions, fetchContractorDirectory } from './actions';
import ExceptionsClient from './ExceptionsClient';

export default async function ExceptionsPage() {
  const [initialData, contractorDirectory] = await Promise.all([
    fetchExceptions(),
    fetchContractorDirectory(),
  ]);

  return <ExceptionsClient initialData={initialData} contractorDirectory={contractorDirectory} />;
}
