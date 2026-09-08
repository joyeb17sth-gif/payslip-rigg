'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { generatePayPeriodSuggestions } from '@/lib/payPeriods';
import { Button } from '@/components/ui/button';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = SHORT_MONTHS[d.getMonth()];
  return `${day}-${month}`;
}

function parseShortDate(str: string, year = 2026): Date | null {
  if (!str) return null;
  const parts = str.trim().split('-');
  if (parts.length !== 2) return null;
  const day = parseInt(parts[0], 10);
  const mIdx = SHORT_MONTHS.indexOf(parts[1]);
  if (isNaN(day) || mIdx === -1) return null;
  return new Date(year, mIdx, day);
}

interface CalendarGridProps {
  periodStart: string;
  periodEnd: string;
  completedPeriods: string[];
  onSelectRange: (start: string, end: string) => void;
  onToggleCompleted: (periodKey: string) => void;
  onClose?: () => void;
}

export default function CalendarGrid({
  periodStart,
  periodEnd,
  completedPeriods,
  onSelectRange,
  onToggleCompleted,
  onClose,
}: CalendarGridProps) {
  // Calendar view state: default to September 2026
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(8); // 8 = September (0-indexed)
  const [settingEnd, setSettingEnd] = useState(false);

  const suggestions = useMemo(() => generatePayPeriodSuggestions(), []);

  // Parse start and end date objects
  const startDateObj = useMemo(() => parseShortDate(periodStart, viewYear), [periodStart, viewYear]);
  const endDateObj = useMemo(() => parseShortDate(periodEnd, viewYear), [periodEnd, viewYear]);

  // Build list of completed date ranges
  const completedRanges = useMemo(() => {
    return suggestions
      .filter(s => completedPeriods.includes(s.periodKey))
      .map(s => ({
        key: s.periodKey,
        label: s.label,
        client: s.client,
        start: s.startDate,
        end: s.endDate,
      }));
  }, [suggestions, completedPeriods]);

  // Check if a given calendar day falls inside any completed period
  const isDateCompleted = (d: Date) => {
    const time = d.getTime();
    return completedRanges.some(r => {
      const s = new Date(r.start); s.setHours(0,0,0,0);
      const e = new Date(r.end); e.setHours(23,59,59,999);
      return time >= s.getTime() && time <= e.getTime();
    });
  };

  // Check if a day is part of current selection
  const isDateSelected = (d: Date) => {
    if (!startDateObj) return false;
    const time = d.getTime();
    const sTime = new Date(startDateObj).setHours(0,0,0,0);
    if (!endDateObj) return time === sTime;
    const eTime = new Date(endDateObj).setHours(23,59,59,999);
    return time >= sTime && time <= eTime;
  };

  const isRangeStart = (d: Date) => {
    if (!startDateObj) return false;
    return d.toDateString() === startDateObj.toDateString();
  };

  const isRangeEnd = (d: Date) => {
    if (!endDateObj) return false;
    return d.toDateString() === endDateObj.toDateString();
  };

  // Navigate months
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Calendar days generation
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
    const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{ date: Date; isCurrentMonth: boolean; dayNum: number }> = [];

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, daysInPrev - i);
      days.push({ date: d, isCurrentMonth: false, dayNum: daysInPrev - i });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrent; day++) {
      const d = new Date(viewYear, viewMonth, day);
      days.push({ date: d, isCurrentMonth: true, dayNum: day });
    }

    // Next month padding to fill grid (up to 42 cells = 6 rows)
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(viewYear, viewMonth + 1, day);
      days.push({ date: d, isCurrentMonth: false, dayNum: day });
    }

    return days;
  }, [viewYear, viewMonth]);

  // Click on a date cell in grid
  const handleDayClick = (d: Date) => {
    const clickedStr = formatShort(d);

    if (!settingEnd || !periodStart || (periodStart && periodEnd)) {
      // Start a new selection
      onSelectRange(clickedStr, '');
      setSettingEnd(true);
    } else {
      // Setting end date
      const startObj = parseShortDate(periodStart, viewYear) || d;
      if (d.getTime() < startObj.getTime()) {
        // Clicked before start: make clicked date the start
        onSelectRange(clickedStr, '');
        setSettingEnd(true);
      } else {
        // Set end date
        onSelectRange(periodStart, clickedStr);
        setSettingEnd(false);
      }
    }
  };

  // Check if active selected range matches an existing cycle
  const currentMatchingCycle = suggestions.find(
    s => s.startFormatted === periodStart && s.endFormatted === periodEnd
  );

  const isCurrentSelectionCompleted = currentMatchingCycle
    ? completedPeriods.includes(currentMatchingCycle.periodKey)
    : false;

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 sm:p-6 w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-200">
      {/* Header with Month / Year and Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              Click days to adjust dates
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {periodStart && periodEnd ? (
              <span>Selected Pay Range: <strong className="text-primary font-mono">{periodStart}</strong> to <strong className="text-primary font-mono">{periodEnd}</strong></span>
            ) : periodStart ? (
              <span>Selected Start: <strong className="text-amber-600 dark:text-amber-400 font-mono">{periodStart}</strong> · Click another day to set End date</span>
            ) : (
              'Click any date to set Start date'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
            title="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => { setViewYear(2026); setViewMonth(8); }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Sep 2026
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
            title="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Selection Action Controls */}
      <div className="py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onSelectRange('01-Sep', '');
              setSettingEnd(true);
            }}
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 flex items-center gap-1"
          >
            <span>Start from Sep 1</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectRange('', '');
              setSettingEnd(false);
            }}
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          >
            Clear Selection
          </button>
        </div>

        {periodStart && periodEnd && (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">
            {periodStart} → {periodEnd}
          </span>
        )}
      </div>

      {/* Day of week labels: Su, Mo, Tu, We, Th, Fr, Sa */}
      <div className="grid grid-cols-7 gap-1 pt-4 text-center">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-xs font-semibold text-slate-400 dark:text-slate-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid Days */}
      <div className="grid grid-cols-7 gap-y-1.5 gap-x-0.5 mt-1">
        {calendarDays.map((item, idx) => {
          const { date, isCurrentMonth, dayNum } = item;
          const completed = isDateCompleted(date);
          const selected = isDateSelected(date);
          const isStart = isRangeStart(date);
          const isEnd = isRangeEnd(date);
          const isSingleDay = isStart && isEnd;
          const isBetween = selected && !isStart && !isEnd;

          // Clean, modern, harmonious styling without harsh red or clashing dark-neon boxes
          let cellClass = '';
          let subLabel = null;

          if (isSingleDay) {
            cellClass = 'bg-primary text-primary-foreground font-bold rounded-xl shadow-xs ring-2 ring-primary/30 z-10';
            subLabel = <span className="text-[8px] font-bold uppercase tracking-wider text-primary-foreground/90 leading-none mt-0.5">Selected</span>;
          } else if (isStart) {
            cellClass = 'bg-primary text-primary-foreground font-bold rounded-l-xl rounded-r-none shadow-xs z-10';
            subLabel = <span className="text-[8px] font-bold uppercase tracking-wider text-primary-foreground/90 leading-none mt-0.5">Start</span>;
          } else if (isEnd) {
            cellClass = 'bg-primary text-primary-foreground font-bold rounded-r-xl rounded-l-none shadow-xs z-10';
            subLabel = <span className="text-[8px] font-bold uppercase tracking-wider text-primary-foreground/90 leading-none mt-0.5">End</span>;
          } else if (isBetween) {
            cellClass = 'bg-primary/15 dark:bg-primary/25 text-primary dark:text-teal-200 font-semibold rounded-none';
            subLabel = <span className="text-[8px] font-bold text-primary/70 dark:text-teal-300 leading-none mt-0.5">•</span>;
          } else if (completed) {
            cellClass = isCurrentMonth
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl hover:bg-emerald-100/70 dark:hover:bg-emerald-900/60 shadow-2xs'
              : 'text-slate-300 dark:text-slate-700 rounded-xl';
            subLabel = isCurrentMonth ? (
              <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center leading-none mt-0.5">
                Paid
              </span>
            ) : null;
          } else {
            cellClass = isCurrentMonth
              ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium'
              : 'text-slate-300 dark:text-slate-600 rounded-xl';
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleDayClick(date)}
              className={`relative h-11 w-full flex flex-col items-center justify-center text-sm transition-all cursor-pointer ${cellClass}`}
            >
              <span className="font-mono leading-none">{dayNum}</span>
              {subLabel}
            </button>
          );
        })}
      </div>

      {/* Legend & Action Bar */}
      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 border border-emerald-600 dark:border-emerald-400 inline-block"></span>
            <span className="font-medium text-slate-700 dark:text-slate-300">Completed / Paid Date</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block"></span>
            <span className="font-medium text-slate-700 dark:text-slate-300">Selected Range</span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {currentMatchingCycle && (
            <button
              type="button"
              onClick={() => onToggleCompleted(currentMatchingCycle.periodKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isCurrentSelectionCompleted
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isCurrentSelectionCompleted ? 'Paid (Click to Undo)' : 'Mark This Period Paid'}</span>
            </button>
          )}

          {onClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
