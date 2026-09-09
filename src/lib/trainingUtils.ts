/**
 * Training logic and utilities.
 * Rule: Trainees progress to "Waiting" once they reach the 5 days marker (5 unique training days),
 * regardless of the total hours worked.
 */

export const REQUIRED_TRAINING_DAYS = 5;
export const TRAINING_HOURLY_RATE = 25.00;

/**
 * Returns the Saturday start of the week (Saturday–Friday cycle).
 */
export const getWeekStart = (d: Date): Date => {
  const daysSinceSat = (d.getDay() + 1) % 7; // Sun=0→1, Mon=1→2, ..., Sat=6→0
  const sat = new Date(d);
  sat.setDate(d.getDate() - daysSinceSat);
  sat.setHours(0, 0, 0, 0);
  return sat;
};

/**
 * Calculates the target release week date (YYYY-MM-DD) based on 5 completed training days.
 * - Majority in Week 1 (>= 3 of first 5 days): Release = Week1_start + 14 days
 * - Minority in Week 1: Release = latest majority week start + 14 days
 */
export const calculateReleaseWeek = (trainingDates: string[]): string | undefined => {
  if (!trainingDates || trainingDates.length < REQUIRED_TRAINING_DAYS) return undefined;
  
  const counts = new Map<number, number>(); // week start timestamp → count
  for (const ds of trainingDates) {
    const d = new Date(ds);
    if (isNaN(d.getTime())) continue;
    const ws = getWeekStart(d).getTime();
    counts.set(ws, (counts.get(ws) || 0) + 1);
  }
  const sortedWeeks = [...counts.keys()].sort((a, b) => a - b);
  if (sortedWeeks.length === 0) return undefined;
  
  const firstWeek = sortedWeeks[0];
  let releaseTs: number;
  if ((counts.get(firstWeek) || 0) >= 3) {
    // Majority in week 1 → release at week 3 (week1 + 14 days)
    releaseTs = firstWeek + 14 * 86400000;
  } else if (sortedWeeks.length > 1) {
    // Minority in week 1 → find the later week with the most days, release 2 weeks after it
    const laterMajority = sortedWeeks.slice(1).reduce((best, w) =>
      (counts.get(w) || 0) > (counts.get(best) || 0) ? w : best
    , sortedWeeks[1]);
    releaseTs = laterMajority + 14 * 86400000;
  } else {
    releaseTs = firstWeek + 14 * 86400000;
  }
  return new Date(releaseTs).toISOString().split('T')[0];
};

/**
 * Derives trainee status based on the 5-day marker regardless of hours worked.
 */
export function deriveTraineeStatus(record: {
  pay_released?: boolean;
  status?: string;
  training_dates?: string[];
  target_release_week?: string;
}): 'PAID' | 'Released' | 'Waiting' | 'Training' {
  if (record.pay_released || record.status === 'PAID') {
    return 'PAID';
  }
  if (record.status === 'Released' || record.status === 'Ready to Pay') {
    return 'Released';
  }

  const daysCount = record.training_dates ? record.training_dates.length : 0;
  
  // 5 days marker: transitions to Waiting (or Released if date reached) regardless of hours
  if (daysCount >= REQUIRED_TRAINING_DAYS) {
    if (record.target_release_week) {
      const releaseDate = new Date(record.target_release_week);
      if (!isNaN(releaseDate.getTime()) && new Date() >= releaseDate) {
        return 'Released';
      }
    }
    return 'Waiting';
  }

  return 'Training';
}
