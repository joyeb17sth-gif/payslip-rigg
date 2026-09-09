'use server';

import { getTraining, saveTraining, TrainingRecord } from '@/lib/data';
import { calculateReleaseWeek, deriveTraineeStatus } from '@/lib/trainingUtils';
import { revalidatePath } from 'next/cache';

export async function getTrainingRecords() {
  return await getTraining();
}

export async function markPaid(name: string, location: string) {
  const records = await getTraining();
  const updated = records.map(r => {
    if (r.name === name && r.location === location) {
      return { ...r, status: 'PAID', pay_released: true };
    }
    return r;
  });
  await saveTraining(updated);
  revalidatePath('/training');
  revalidatePath('/payslips');
}

export async function updateTraineeStatus(name: string, location: string, newStatus: string) {
  const records = await getTraining();
  const updated = records.map(r => {
    if (r.name === name && r.location === location) {
      const pay_released = newStatus === 'PAID';
      let target_release_week = r.target_release_week;
      if (newStatus === 'Released' && !target_release_week) {
        const lastDate = r.training_dates && r.training_dates.length > 0 
          ? new Date(r.training_dates[r.training_dates.length - 1]) 
          : new Date();
        target_release_week = lastDate.toISOString().split('T')[0];
      }
      return { 
        ...r, 
        status: newStatus, 
        pay_released,
        target_release_week
      };
    }
    return r;
  });
  await saveTraining(updated);
  revalidatePath('/training');
  revalidatePath('/payslips');
}

export async function forceRelease(name: string, location: string) {
  return updateTraineeStatus(name, location, 'Released');
}

export async function syncTrainees(traineeRows: any[]) {
  const records = await getTraining();

  // --- Step 1: Group all rows from this CSV by trainee (normName + location) ---
  const fromCsv = new Map<string, { name: string; location: string; normName: string; role: string; dates: Set<string>; totalHours: number }>();

  for (const row of traineeRows) {
    const pc = String(row['Pay Condition'] || '').toUpperCase();
    if (pc.includes('SA 7-0') || pc.includes('SA 0-7') || pc.includes('SA7-0') || pc.includes('SA0-7')) {
      continue;
    }

    const name = `${row['First Name'] || ''} ${row['Surname'] || ''}`.trim() || String(row['Sub Contractor'] || '').trim();
    if (!name) continue;
    const location = (row['Location'] || '').trim();
    const normName = name.replace(/\s+/g, '').toUpperCase();
    const key = `${normName}|${location}`;

    // Parse Date
    let dateStr = '';
    if (row['Date']) {
      const parts = String(row['Date']).split(' ')[0].split('-');
      dateStr = parts.length === 3 && parts[2].length === 4
        ? `${parts[2]}-${parts[1]}-${parts[0]}`  // DD-MM-YYYY → YYYY-MM-DD
        : String(row['Date']).split(' ')[0];
    } else if (row['Timesheet date']) {
      dateStr = String(row['Timesheet date']).split(' ')[0];
    }

    // Parse Duration
    let hours = 0;
    const duration = String(row['Duration'] || row['Hours'] || '').trim();
    if (duration && duration !== 'nan') {
      const parts = duration.split(':');
      hours = parts.length >= 2
        ? Math.round((parseFloat(parts[0]) + parseFloat(parts[1]) / 60) * 100) / 100
        : parseFloat(duration) || 0;
    }
    if (hours <= 0) continue;

    if (!fromCsv.has(key)) {
      fromCsv.set(key, { name, location, normName, role: row['Role'] || 'Trainee', dates: new Set(), totalHours: 0 });
    }
    const entry = fromCsv.get(key)!;
    if (dateStr) entry.dates.add(dateStr);
    entry.totalHours = Math.round((entry.totalHours + hours) * 100) / 100;
  }

  if (fromCsv.size === 0) return;

  // --- Step 2: Upsert — CSV is source of truth for hours/dates ---
  for (const [, csv] of fromCsv) {
    const newDates = [...csv.dates].sort();
    const existingIndex = records.findIndex(r => r.norm_name === csv.normName && r.location === csv.location);

    if (existingIndex >= 0) {
      const r = records[existingIndex];
      // Merge dates (union of old + new), use max hours to prevent stacking on re-upload
      r.training_dates = [...new Set([...(r.training_dates || []), ...newDates])].sort();
      r.total_hours = Math.max(r.total_hours || 0, csv.totalHours);

      // Set release week if not already set and 5 days threshold met
      if (!r.target_release_week && r.status !== 'PAID') {
        const rw = calculateReleaseWeek(r.training_dates || []);
        if (rw) r.target_release_week = rw;
      }

      // Automatically update status based on 5-day marker (unless already PAID or manually Released)
      r.status = deriveTraineeStatus({
        pay_released: r.pay_released || r.status === 'PAID',
        status: r.status,
        training_dates: r.training_dates,
        target_release_week: r.target_release_week,
      });
    } else {
      const releaseWeek = calculateReleaseWeek(newDates);
      const status = deriveTraineeStatus({
        pay_released: false,
        training_dates: newDates,
        target_release_week: releaseWeek,
      });

      records.push({
        client: 'IHS',
        location: csv.location,
        norm_name: csv.normName,
        name: csv.name,
        role: csv.role,
        training_dates: newDates,
        total_hours: csv.totalHours,
        status,
        ...(releaseWeek ? { target_release_week: releaseWeek } : {})
      });
    }
  }

  await saveTraining(records);
  revalidatePath('/training');
}
