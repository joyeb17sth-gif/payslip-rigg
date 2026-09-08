import { getTrainingRecords } from './actions';
import TrainingClient from './TrainingClient';

export default async function TrainingPage() {
  const initialData = await getTrainingRecords();
  return <TrainingClient initialData={initialData} />;
}
