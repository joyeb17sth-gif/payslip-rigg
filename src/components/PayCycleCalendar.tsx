'use client';

import { useMemo } from 'react';
import { generatePayPeriodSuggestions, PayCycleOption } from '@/lib/payPeriods';
import { getActivePayPeriod } from '@/lib/payPeriodStorage';
import { Calendar } from 'lucide-react';

function PeriodRow({ period, shade }: { period: PayCycleOption; shade: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${shade}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest w-16 shrink-0 ${
          period.client === 'IHS' ? 'text-teal-700 dark:text-teal-400' : 'text-violet-700 dark:text-violet-400'
        }`}>
          {period.client === 'IHS' ? 'IHS' : 'ZBS'}
        </span>
        <span className="font-mono font-semibold">
          {period.startFormatted} – {period.endFormatted}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground/70 font-medium">
        {period.type === 'Weekly' ? '7-day · Mon–Sun' : '14-day fortnight'}
      </span>
    </div>
  );
}

export default function PayCycleCalendar({ compact = false }: { compact?: boolean }) {
  const all = useMemo(() => {
    if (typeof window !== 'undefined') {
      const active = getActivePayPeriod();
      return generatePayPeriodSuggestions(active.start, active.end);
    }
    return generatePayPeriodSuggestions('01-Sep', '07-Sep');
  }, []);

  const ihsPeriods = useMemo(() => all.filter(p => p.client === 'IHS'), [all]);
  const zbPeriods = useMemo(() => all.filter(p => p.client === 'ZBsolution'), [all]);

  if (compact) {
    // Show current active period
    const recentIhs = ihsPeriods.slice(0, 1);
    const recentZb = zbPeriods.slice(0, 1);
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold text-foreground">Pay Period Reference</span>
        </div>
        {recentIhs.map(p => (
          <span key={p.periodKey} className="font-mono text-teal-700 dark:text-teal-400">
            IHS: {p.startFormatted}–{p.endFormatted}
          </span>
        ))}
        {recentZb.map(p => (
          <span key={p.periodKey} className="font-mono text-violet-700 dark:text-violet-400">
            ZBS: {p.startFormatted}–{p.endFormatted}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">Pay Period Reference Calendar</h2>
        <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
          Select your period in Payslip Generator
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IHS Weekly */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400">IHS</span>
            <span className="text-xs text-muted-foreground">Weekly · Mon to Sun · Timesheet arrives Wed</span>
          </div>
          {ihsPeriods.map((p, i) => (
            <PeriodRow
              key={p.periodKey}
              period={p}
              shade={
                i < 2
                  ? 'bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50'
                  : 'bg-slate-50 dark:bg-slate-900/20 border border-transparent'
              }
            />
          ))}
        </div>

        {/* ZBsolution Fortnightly */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400">ZBsolution</span>
            <span className="text-xs text-muted-foreground">Fortnightly · 14-day cycle</span>
          </div>
          {zbPeriods.map((p, i) => (
            <PeriodRow
              key={p.periodKey}
              period={p}
              shade={
                i < 1
                  ? 'bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50'
                  : 'bg-slate-50 dark:bg-slate-900/20 border border-transparent'
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
