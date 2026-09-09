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
 * Calculates the target release week date (YYYY-MM-DD) based on the 3-week rule.
 * Trainees must wait 3 weeks (21 days) after completing their required 5 training days.
 */
export const calculateReleaseWeek = (trainingDates: string[]): string | undefined => {
  if (!trainingDates || trainingDates.length < REQUIRED_TRAINING_DAYS) return undefined;
  
  // Sort training dates chronologically
  const sorted = [...trainingDates].sort();
  // The completion date is the date the trainee completed their 5th day
  const completionDateStr = sorted[REQUIRED_TRAINING_DAYS - 1] || sorted[sorted.length - 1];
  const completionDate = new Date(completionDateStr);
  if (isNaN(completionDate.getTime())) return undefined;

  // 3rd week rule: Pay is held for 3 weeks (21 days) after 5-day completion
  const releaseTs = completionDate.getTime() + 21 * 86400000;
  return new Date(releaseTs).toISOString().split('T')[0];
};

/**
 * Derives trainee status based on the 5-day marker and 3-week waiting rule:
 * - If marked PAID or pay_released: 'PAID'
 * - If manually Released: 'Released'
 * - If completed >= 5 days: 'Waiting' (holding for 3 weeks waiting period)
 * - If < 5 days: 'Training'
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

  const daysCount = record.training_dates ? record.training_dates.length : 0;
  
  // Under 5 days: still in training
  if (daysCount < REQUIRED_TRAINING_DAYS) {
    return 'Training';
  }

  // 5 days marker met: 3-week rule applies
  // If target_release_week is set and still in the future, they MUST stay in Waiting
  if (record.target_release_week) {
    const releaseDate = new Date(record.target_release_week);
    if (!isNaN(releaseDate.getTime()) && new Date() < releaseDate) {
      return 'Waiting';
    }
  }

  // If 3 weeks have passed and explicitly marked Released
  if (record.status === 'Released' || record.status === 'Ready to Pay') {
    return 'Released';
  }

  return 'Waiting';
}
