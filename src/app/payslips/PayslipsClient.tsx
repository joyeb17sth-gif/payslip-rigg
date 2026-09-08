'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ContractorRate, Deduction, CodeException, OnceOnlyException, TrainingRecord, InvoiceRateItem } from '@/lib/data';
import { parseFileBuffer, generatePayslips, PayslipRecord, generateInvoiceSummary, parsePeriodDate } from '@/lib/calculators';
import { 
  calculateContractorSummaries, 
  ContractorSummary, 
  ProcessedRecord, 
  cleanName,
  locMatches
} from '@/lib/payrollSummary';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Download, UploadCloud, Calendar, Check, ChevronDown, 
  DollarSign, Scissors, FileSpreadsheet, Users, Search, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, Sparkles, Receipt, Building2, Hotel, X, CheckCircle2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { generateExcel, generateStandaloneInvoiceExcel } from '@/lib/excelGenerator';
import { syncTrainees } from '@/app/training/actions';
import { generatePayPeriodSuggestions, PayCycleOption } from '@/lib/payPeriods';
import { togglePeriodCompletion, fetchPayslipContext, markReleasedTraineesAsPaid } from './actions';
import CalendarGrid from './CalendarGrid';

// Module-level cache — survives React unmount/remount during SPA navigation
const cache: { data: PayslipRecord[]; periodStart: string; periodEnd: string } = {
  data: [],
  periodStart: '01-Sep',
  periodEnd: '',
};

interface PayslipsClientProps {
  context: {
    rates: ContractorRate[];
    deductions: Deduction[];
    codeExceptions?: CodeException[];
    onceOnlyExceptions?: OnceOnlyException[];
    releasedTrainees?: TrainingRecord[];
    completedPeriods?: string[];
    invoiceRates?: InvoiceRateItem[];
  };
}

export default function PayslipsClient({ context: initialContext }: PayslipsClientProps) {
  const [context, setContext] = useState(initialContext);
  const [suggestions] = useState<PayCycleOption[]>(() => generatePayPeriodSuggestions());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [data, setData] = useState<PayslipRecord[]>(cache.data);
  const [periodStart, setPeriodStart] = useState<string>(cache.periodStart);
  const [periodEnd, setPeriodEnd] = useState<string>(cache.periodEnd);
  const [completedPeriods, setCompletedPeriods] = useState<string[]>(
    initialContext.completedPeriods || []
  );

  // Tab switcher state: 'summary' (Contractor summaries), 'records' (Shift records), 'invoice' (Client Invoice Summary)
  const [activeTab, setActiveTab] = useState<'summary' | 'records' | 'invoice'>('summary');

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [onlyWithDeductions, setOnlyWithDeductions] = useState(false);
  const [onlyZeroPay, setOnlyZeroPay] = useState(false);

  // Invoicing Location Profile (ZB Solution: Ozone & Beyond) & live adjustable rates
  const [invoiceLocation, setInvoiceLocation] = useState<'Ozone' | 'Beyond'>('Ozone');
  const [customLocationName, setCustomLocationName] = useState<string>('Ozone');
  const initialOzone = initialContext.invoiceRates?.find(r => r.location.toLowerCase() === 'ozone');
  const [weekdayRate, setWeekdayRate] = useState<number>(initialOzone?.weekdays ?? 30.0);
  const [weekendRate, setWeekendRate] = useState<number>(initialOzone?.weekend ?? 32.0);

  const ozoneRateInfo = context.invoiceRates?.find(r => r.location.toLowerCase() === 'ozone') || { weekdays: 30.0, weekend: 32.0 };
  const beyondRateInfo = context.invoiceRates?.find(r => r.location.toLowerCase() === 'beyond') || { weekdays: 32.0, weekend: 34.0 };

  // Trainee Lifecycle State (Released -> PAID)
  const [releasedTrainees, setReleasedTrainees] = useState<TrainingRecord[]>(initialContext.releasedTrainees || []);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paidSuccessMessage, setPaidSuccessMessage] = useState('');
  const [showExportPaidPrompt, setShowExportPaidPrompt] = useState(false);

  const handleMarkTraineesPaid = async () => {
    if (releasedTrainees.length === 0) return;
    setIsMarkingPaid(true);
    try {
      await markReleasedTraineesAsPaid(releasedTrainees.map(t => t.name));
      const count = releasedTrainees.length;
      setReleasedTrainees([]);
      setShowExportPaidPrompt(false);
      setPaidSuccessMessage(`Successfully marked ${count} released trainee${count > 1 ? 's' : ''} as PAID in Training Tracker!`);
      setTimeout(() => setPaidSuccessMessage(''), 8000);
    } catch (err) {
      console.error('Failed to mark trainees as paid:', err);
    } finally {
      setIsMarkingPaid(false);
    }
  };

  // Split Upload Menu State
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [uploadTargetClient, setUploadTargetClient] = useState<'IHS' | 'Ozone' | 'Beyond'>('IHS');
  const [loadedClient, setLoadedClient] = useState<'IHS' | 'Ozone' | 'Beyond' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect whether current dataset is IHS (multi-location hotels) vs ZB Solution (Ozone/Beyond)
  const isCurrentIHS = useMemo(() => {
    if (loadedClient === 'IHS') return true;
    if (loadedClient === 'Ozone' || loadedClient === 'Beyond') return false;
    if (data.length === 0) return true;
    return data.some(r => {
      const l = (r.Location || '').toUpperCase().trim();
      return l && !['OZONE', 'BEYOND', 'ZBS', ''].includes(l);
    });
  }, [loadedClient, data]);

  const triggerUpload = (target: 'IHS' | 'Ozone' | 'Beyond') => {
    setUploadTargetClient(target);
    setIsUploadMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleInvoiceLocationChange = (loc: string) => {
    const match = context.invoiceRates?.find(r => r.location.toLowerCase() === loc.toLowerCase());
    if (match) {
      setInvoiceLocation(match.location as 'Ozone' | 'Beyond');
      setWeekdayRate(match.weekdays);
      setWeekendRate(match.weekend);
    }
  };

  const activeRateSchedule = useMemo(() => ({
    weekdays: weekdayRate,
    weekend: weekendRate,
  }), [weekdayRate, weekendRate]);

  // Keep cache in sync whenever state changes
  useEffect(() => { cache.data = data; }, [data]);
  useEffect(() => { cache.periodStart = periodStart; }, [periodStart]);
  useEffect(() => { cache.periodEnd = periodEnd; }, [periodEnd]);

  // Refresh context on mount to ensure latest exceptions from disk
  useEffect(() => {
    fetchPayslipContext().then(fresh => {
      if (fresh) {
        setContext(fresh);
        if (fresh.completedPeriods) {
          setCompletedPeriods(fresh.completedPeriods);
        }
      }
    });
  }, []);

  const handleToggleCompleted = async (periodKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isCompleted = completedPeriods.includes(periodKey);
    const updated = isCompleted 
      ? completedPeriods.filter(k => k !== periodKey)
      : [...completedPeriods, periodKey];
    setCompletedPeriods(updated);
    await togglePeriodCompletion(periodKey, !isCompleted);
  };

  const processTimesheetBuffer = async (buffer: ArrayBuffer, filename: string, defaultLoc = '') => {
    // Refresh context immediately upon processing to ensure up-to-date deductions & exceptions
    const freshContext = await fetchPayslipContext();
    if (freshContext) {
      setContext(freshContext);
    }

    const currentContext = freshContext || context;
    const rawData = parseFileBuffer(buffer, filename);
    
    // 1. Separate trainees
    const isTrainee = (r: any) => {
       const role = String(r.Role || '').toUpperCase();
       const name = String(r['First Name'] || r.name || r['Sub Contractor'] || '').toUpperCase();
       const pc = String(r['Pay Condition'] || '').toUpperCase();

       if (pc.includes('SA 7-0') || pc.includes('SA 0-7') || pc.includes('SA7-0') || pc.includes('SA0-7')) {
         return false;
       }

       const isTrainer = role.includes('TRAINER') || name.includes('TRAINER') || pc.includes('TRAINER');
       const hasTraineeStr = role.includes('TRAINEE') || name.includes('TRAINEE') || pc.includes('TRAINEE');
       
       return hasTraineeStr && !isTrainer;
    };

    const traineeRows = rawData.filter(isTrainee);
    const regularRows = rawData.filter(r => !isTrainee(r));

    if (traineeRows.length > 0) {
       await syncTrainees(traineeRows);
    }

    // 2. Generate base payslip records for non-trainees
    const baseRecords = generatePayslips(regularRows, defaultLoc);

    // Auto-detect pay period date range from timesheet records if available
    const validDates = baseRecords
      .map(r => r['Timesheet date'])
      .filter(d => d && d !== 'nan')
      .sort();
    if (validDates.length > 0) {
      const minD = parsePeriodDate(validDates[0]);
      const maxD = parsePeriodDate(validDates[validDates.length - 1]);
      if (minD && maxD) {
        const fmtStart = `${String(minD.getDate()).padStart(2, '0')}-${minD.toLocaleString('en-US', { month: 'short' })}`;
        const fmtEnd = `${String(maxD.getDate()).padStart(2, '0')}-${maxD.toLocaleString('en-US', { month: 'short' })}`;
        setPeriodStart(fmtStart);
        setPeriodEnd(fmtEnd);
      }
    }

    // 2a. Inject Trainees whose training pay was released (Marked PAID) for generation
    const releasedList = currentContext.releasedTrainees || [];
    for (const t of releasedList) {
      if ((t.total_hours || 0) > 0) {
        baseRecords.push({
          'Timesheet date': t.target_release_week || '',
          Location: t.location || defaultLoc,
          'Sub Contractor': t.name,
          Role: 'Training Pay Released',
          'Pay Condition': 'Training Pay Released',
          Code: 'TPR',
          pc_raw: 'Training Pay Released',
          Hours: t.total_hours || 0,
        });
      }
    }

    // 3. Apply Rates
    const finalRecords = baseRecords.map(r => {
      let rate = 0;
      const normEmp = r['Sub Contractor'].toUpperCase().replace(/\s+/g, '');
      const codeRaw = (r.Code || '').trim().toUpperCase();
      
      if (codeRaw === 'TPR') {
        rate = 25.00;
      } else if (codeRaw === 'OPAL') {
        rate = 10.00;
      } else {
        const empKey = (!codeRaw || codeRaw === 'NONE') 
          ? normEmp 
          : `${normEmp}(${codeRaw})`.replace(/\s+/g, '');

        // Helper to find a rate from the flat array, smartly handling name variations, prefixes, & 'NAN' suffixes
        const findRate = (matchName: string) => {
          let cleanMatch = matchName
            .toUpperCase()
            .replace(/^CLEANER\s*[\d\-]*\s*/i, '')
            .replace(/\s+NAN\b/gi, '')
            .replace(/\bNAN\s+/gi, '')
            .replace(/[^A-Z0-9]/g, '');

          while (cleanMatch.endsWith('NAN')) {
            cleanMatch = cleanMatch.slice(0, -3);
          }

          const candidates = new Set<string>();
          candidates.add(cleanMatch);

          // Smart aliases for cleaner / contractor variations
          if (cleanMatch === 'JENIKA' || cleanMatch === 'JANIKA') {
            candidates.add('JANIKA');
            candidates.add('JENIKA');
          }
          if (cleanMatch === 'LAXMI' || cleanMatch === 'LAXMIWAIBA') {
            candidates.add('LAXMIWAIBA');
            candidates.add('LAXMI');
          }
          if (cleanMatch === 'MILAN' || cleanMatch === 'MILANCHAPAGAIN') {
            candidates.add('MILANCHAPAGAIN');
            candidates.add('MILAN');
          }
          if (cleanMatch === 'PRITAM' || cleanMatch === 'PRITAMTHAPACHHETRI') {
            candidates.add('PRITAMTHAPACHHETRI');
            candidates.add('PRITAM');
          }

          const targetDay = r['Pay Condition'];
          // 1. Exact match with candidates
          let found = currentContext.rates.find((cr: ContractorRate) => {
            const crClean = cr.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
            return candidates.has(crClean) && cr.dayType === targetDay;
          });

          // 2. Subcontractor parenthetical match (e.g. PRANJAL(MEERAHAMEDFARUK) matches PRANJAL)
          if (!found) {
            found = currentContext.rates.find((cr: ContractorRate) => {
              const crNameUpper = cr.name.toUpperCase();
              const baseFromParen = crNameUpper.split('(')[0].replace(/[^A-Z0-9]/g, '');
              const matchesBase = candidates.has(baseFromParen);
              const locMatch = !cr.location || locMatches(cr.location, r.Location);
              return matchesBase && locMatch && cr.dayType === targetDay;
            });
          }

          return found ? found.rate : null;
        };

        let foundRate = findRate(empKey);
        if (foundRate === null && empKey !== normEmp) {
          foundRate = findRate(normEmp);
        }

        rate = foundRate || 0;
      }

      const total = Math.round(r.Hours * rate * 100) / 100;

      return {
        ...r,
        Rate: rate || 'Not Found',
        Total: total || 0
      };
    });

    setData(finalRecords);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    e.target.value = ''; // reset so same file can be re-uploaded

    if (uploadTargetClient === 'Ozone') {
      setLoadedClient('Ozone');
      setCustomLocationName('Ozone');
      handleInvoiceLocationChange('Ozone');
      await processTimesheetBuffer(buffer, file.name, 'Ozone');
      setActiveTab('invoice');
    } else if (uploadTargetClient === 'Beyond') {
      setLoadedClient('Beyond');
      setCustomLocationName('Beyond');
      handleInvoiceLocationChange('Beyond');
      await processTimesheetBuffer(buffer, file.name, 'Beyond');
      setActiveTab('invoice');
    } else {
      setLoadedClient('IHS');
      // Standard IHS timesheet processing (auto-detects locations from file)
      await processTimesheetBuffer(buffer, file.name, '');
    }
  };

  const handleLoadSample = async () => {
    try {
      setLoadedClient('IHS');
      const res = await fetch('/api/sample-timesheet');
      if (!res.ok) throw new Error('Failed to load sample');
      const buffer = await res.arrayBuffer();
      await processTimesheetBuffer(buffer, 'test_ihs_timesheet.csv');
    } catch (err) {
      console.error('Error loading sample timesheet:', err);
    }
  };

  const handleExport = async () => {
    if (data.length === 0) return;
    const processedData: ProcessedRecord[] = data.map(d => ({
      ...d,
      Rate: d.Rate === 'Not Found' ? 0 : Number(d.Rate),
      Total: Number(d.Total) || 0
    }));

    const buffer = await generateExcel(
      processedData, 
      context, 
      periodStart, 
      periodEnd, 
      isCurrentIHS ? null : activeRateSchedule, 
      isCurrentIHS ? '' : customLocationName,
      isCurrentIHS
    );
    
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCurrentIHS
      ? `IHS_Payslips_${periodStart || 'Period'}_to_${periodEnd || 'End'}.xlsx`
      : `ZB_${customLocationName || 'Solution'}_Payslips_${periodStart || 'Period'}_to_${periodEnd || 'End'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    if (releasedTrainees.length > 0) {
      setShowExportPaidPrompt(true);
    }
  };

  const handleExportInvoice = async () => {
    if (data.length === 0) return;
    const locName = customLocationName.trim() || 'Ozone';
    const companyHeader = isCurrentIHS ? 'IHS HOSPITALITY' : `ZB SOLUTION (${locName.toUpperCase()})`;
    const buffer = await generateStandaloneInvoiceExcel(
      data, 
      periodStart, 
      periodEnd, 
      companyHeader, 
      isCurrentIHS ? null : activeRateSchedule, 
      isCurrentIHS ? '' : locName,
      isCurrentIHS
    );
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCurrentIHS
      ? `IHS_Timesheet_Summary_${periodStart || 'Period'}_to_${periodEnd || 'End'}.xlsx`
      : `ZB_Solution_Invoice_${locName.replace(/[^a-zA-Z0-9]/g, '_')}_${periodStart || 'Period'}_to_${periodEnd || 'End'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Invoice Summary calculation:
  // For IHS, keep dynamic locations directly from each row and use contractor rates
  // For ZB Solution, use customLocationName and activeRateSchedule
  const invoiceData = useMemo(() => {
    if (data.length === 0) return { items: [], totalHours: 0, totalAmount: 0 };
    return generateInvoiceSummary(
      data, 
      periodStart, 
      isCurrentIHS ? '' : customLocationName, 
      isCurrentIHS ? null : activeRateSchedule, 
      isCurrentIHS
    );
  }, [data, periodStart, customLocationName, activeRateSchedule, isCurrentIHS]);

  const filteredInvoiceItems = useMemo(() => {
    const list = invoiceData.items;
    if (!invoiceSearchQuery.trim()) return list;
    const q = invoiceSearchQuery.toLowerCase();
    return list.filter(it => 
      it.staff.toLowerCase().includes(q) ||
      it.location.toLowerCase().includes(q) ||
      it.date.toLowerCase().includes(q) ||
      it.day.toLowerCase().includes(q)
    );
  }, [invoiceData.items, invoiceSearchQuery]);

  // Unified contractor summaries calculation (Gross, Deductions, Net Pay)
  const summaries = useMemo(() => {
    if (data.length === 0) return [];
    const processedData: ProcessedRecord[] = data.map(d => ({
      ...d,
      Rate: d.Rate === 'Not Found' ? 0 : Number(d.Rate),
      Total: Number(d.Total) || 0
    }));
    return calculateContractorSummaries(processedData, context, periodStart, periodEnd);
  }, [data, context, periodStart, periodEnd]);

  // Overall financial statistics
  const stats = useMemo(() => {
    const totalGross = summaries.reduce((acc, s) => acc + s.grossPay, 0);
    const totalDeductions = summaries.reduce((acc, s) => acc + s.totalDeductions, 0);
    const totalNet = summaries.reduce((acc, s) => acc + s.netPay, 0);
    const withDeductionsCount = summaries.filter(s => s.deductions.length > 0).length;
    const totalHours = summaries.reduce((acc, s) => acc + s.totalHours, 0);

    return {
      totalGross: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      withDeductionsCount,
      totalHours: Math.round(totalHours * 100) / 100,
      contractorCount: summaries.length,
    };
  }, [summaries]);

  // Identify contractors who worked hours but have $0.00 total/net pay (and diagnose the exact cause)
  const zeroPayIssues = useMemo(() => {
    return summaries
      .filter(s => s.totalHours > 0 && (s.grossPay === 0 || s.netPay === 0))
      .map(s => {
        let reason = '';
        let suggestion = '';
        const zeroRecords = s.records.filter(r => Number(r.Total) === 0 || r.Rate === 0 || r.Rate === 'Not Found');

        if (s.grossPay === 0) {
          const sample = zeroRecords[0] || s.records[0];
          const condition = sample ? sample['Pay Condition'] : 'Unknown';
          const code = sample && sample.Code ? sample.Code : 'None';
          reason = `Rate is missing or $0.00 for "${s.name}" at "${s.location}" on condition "${condition}" (Timesheet Code: "${code}").`;

          // Search context rates for any similar name in database
          const norm = cleanName(s.name);
          const closeMatch = context.rates.find(cr => {
            const crClean = cleanName(cr.name);
            return crClean.includes(norm) || norm.includes(crClean);
          });
          if (closeMatch) {
            suggestion = `Rates exist under alias "${closeMatch.name}" (${closeMatch.location}). Verify spelling or subcontractor alias.`;
          } else {
            suggestion = `Go to the Rates tab to add rate for "${s.name}" at "${s.location}".`;
          }
        } else if (s.netPay === 0) {
          reason = `Gross pay of $${s.grossPay.toFixed(2)} was 100% offset by $${Math.abs(s.totalDeductions).toFixed(2)} in deductions (${s.deductions.map(d => d.label).join(', ')}).`;
        }

        return {
          name: s.name,
          location: s.location,
          totalHours: s.totalHours,
          grossPay: s.grossPay,
          netPay: s.netPay,
          reason,
          suggestion,
        };
      });
  }, [summaries, context.rates]);

  // Filtered summaries for the contractor table
  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      if (onlyZeroPay && !(s.totalHours > 0 && (s.grossPay === 0 || s.netPay === 0))) return false;
      if (onlyWithDeductions && s.deductions.length === 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchLoc = s.location.toLowerCase().includes(q);
        if (!matchName && !matchLoc) return false;
      }
      return true;
    });
  }, [summaries, onlyZeroPay, onlyWithDeductions, searchQuery]);

  // Quick lookup map for individual shift row badges
  const contractorDeductionsLookup = useMemo(() => {
    const map = new Map<string, ContractorSummary>();
    for (const s of summaries) {
      map.set(`${cleanName(s.name)}|${cleanName(s.location)}`, s);
    }
    return map;
  }, [summaries]);

  const currentSelectedPeriod = suggestions.find(
    s => s.startFormatted === periodStart && s.endFormatted === periodEnd
  );
  const isCurrentPeriodCompleted = currentSelectedPeriod 
    ? completedPeriods.includes(currentSelectedPeriod.periodKey)
    : false;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payslip Generator</h1>
          <p className="text-muted-foreground">Upload timesheets to calculate rates, deductions, and trainee releases.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Calendar Picker Trigger */}
          <Button
            variant="outline"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className={`h-9 gap-2 text-xs font-semibold border shadow-xs transition-all cursor-pointer ${
              isCalendarOpen
                ? 'ring-2 ring-primary border-primary bg-primary/5 text-primary'
                : isCurrentPeriodCompleted
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/60'
                : 'bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <Calendar className={`h-4 w-4 ${isCurrentPeriodCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`} />
            <span className="font-mono">
              {periodStart && periodEnd ? (
                `${periodStart}–${periodEnd}`
              ) : periodStart ? (
                `From ${periodStart}`
              ) : (
                'Select Pay Period Calendar'
              )}
            </span>
            {isCurrentPeriodCompleted ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded shadow-xs">
                <Check className="h-3 w-3" /> Paid
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Calendar
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isCalendarOpen ? 'rotate-180' : ''}`} />
          </Button>

          <Input 
            placeholder="Start (01-Sep)" 
            value={periodStart} 
            onChange={e => setPeriodStart(e.target.value)}
            className="w-32 h-9 text-xs font-semibold bg-white dark:bg-slate-950 font-mono"
          />
          <Input 
            placeholder="End (e.g. 07-Sep)" 
            value={periodEnd} 
            onChange={e => setPeriodEnd(e.target.value)}
            className="w-32 h-9 text-xs font-semibold bg-white dark:bg-slate-950 font-mono"
          />
          {/* Split Upload Menu (IHS, ZB: Ozone, ZB: Beyond) */}
          <div className="relative inline-block text-left">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
              className="h-9 gap-2 text-xs font-semibold cursor-pointer border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <UploadCloud className="h-4 w-4 text-primary" />
              <span>Upload Timesheet</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isUploadMenuOpen ? 'rotate-180' : ''}`} />
            </Button>

            {isUploadMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsUploadMenuOpen(false)} />
                <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1.5 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Select Timesheet Destination
                  </div>

                  {/* Option 1: IHS Timesheet */}
                  <button
                    type="button"
                    onClick={() => triggerUpload('IHS')}
                    className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer group"
                  >
                    <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform mt-0.5">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        IHS Timesheet
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-emerald-300 text-emerald-700 dark:text-emerald-300">
                          Weekly
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Hyatt, Shangri-La, Ace, Caption, Q-Station
                      </div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  {/* Option 2: ZB Solution - Ozone */}
                  <button
                    type="button"
                    onClick={() => triggerUpload('Ozone')}
                    className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-blue-50/60 dark:hover:bg-blue-950/40 transition-colors cursor-pointer group"
                  >
                    <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform mt-0.5">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        ZB Solution — Ozone
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-blue-300 text-blue-700 dark:text-blue-300">
                          Ozone CPS
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Rates: ${ozoneRateInfo.weekdays.toFixed(2)} / ${ozoneRateInfo.weekend.toFixed(2)} • Fortnightly
                      </div>
                    </div>
                  </button>

                  {/* Option 3: ZB Solution - Beyond */}
                  <button
                    type="button"
                    onClick={() => triggerUpload('Beyond')}
                    className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer group"
                  >
                    <div className="p-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform mt-0.5">
                      <Hotel className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        ZB Solution — Beyond
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-indigo-300 text-indigo-700 dark:text-indigo-300">
                          Beyond
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Rates: ${beyondRateInfo.weekdays.toFixed(2)} / ${beyondRateInfo.weekend.toFixed(2)} • Fortnightly
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
          </div>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleLoadSample} 
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            id="btn-load-sample"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Load Sample
          </Button>
          <Button onClick={handleExport} disabled={data.length === 0} className="h-9 gap-2 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer">
            <Download className="h-4 w-4" />
            Export Results
          </Button>
          <Button 
            onClick={handleExportInvoice} 
            disabled={data.length === 0} 
            variant="outline"
            className="h-9 gap-1.5 text-xs border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-xs cursor-pointer font-semibold"
          >
            <Receipt className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Export Invoice
          </Button>
        </div>
      </div>

      {/* Interactive Pay Period Monthly Calendar Grid */}
      {isCalendarOpen && (
        <div className="py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CalendarGrid
            periodStart={periodStart}
            periodEnd={periodEnd}
            completedPeriods={completedPeriods}
            onSelectRange={(start, end) => {
              setPeriodStart(start);
              setPeriodEnd(end);
            }}
            onToggleCompleted={handleToggleCompleted}
            onClose={() => setIsCalendarOpen(false)}
          />
        </div>
      )}

      {/* Released Trainees Notice if any are pending payout */}
      {releasedTrainees.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs px-3.5 py-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[11px]">
              {releasedTrainees.length} Released Trainee{releasedTrainees.length > 1 ? 's' : ''}
            </Badge>
            <span>Training pay is released and included in this run at $25.00/hr.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={isMarkingPaid}
              onClick={handleMarkTraineesPaid}
              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-none font-semibold shadow-xs cursor-pointer gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isMarkingPaid ? 'Marking...' : `Mark ${releasedTrainees.length} as PAID`}
            </Button>
            <Link href="/training" className="font-medium text-muted-foreground hover:text-foreground transition-colors">
              Manage Tracker &rarr;
            </Link>
          </div>
        </div>
      ) : paidSuccessMessage ? (
        <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 text-emerald-800 dark:text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{paidSuccessMessage}</span>
          </div>
          <button onClick={() => setPaidSuccessMessage('')} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Post-Export Prompt to Mark Trainees as Paid */}
      {showExportPaidPrompt && releasedTrainees.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs px-4 py-3 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              <strong>Payslips Exported!</strong> Mark the <strong>{releasedTrainees.length} released trainees</strong> as <strong>PAID</strong> in the Training Tracker so they won&apos;t be paid again next fortnight?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={isMarkingPaid}
              onClick={handleMarkTraineesPaid}
              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-none font-bold shadow-xs cursor-pointer gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isMarkingPaid ? 'Marking...' : 'Yes, Mark as PAID'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowExportPaidPrompt(false)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Real-time KPI Metric Cards when Timesheet is uploaded */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-3 duration-300">
          <Card className="border shadow-xs bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total Gross Pay</span>
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                ${stats.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Before deductions ({stats.totalHours.toLocaleString()} hrs)
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-xs bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Deductions Applied</span>
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                  <Scissors className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {stats.totalDeductions < 0 ? `-$${Math.abs(stats.totalDeductions).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$0.00`}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-rose-200 text-rose-700 dark:text-rose-300">
                  {stats.withDeductionsCount} contractors
                </Badge>
                <span>with active deductions</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-xs bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Net Pay Total</span>
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                ${stats.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Final disbursement amount
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-xs bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Contractors & Sites</span>
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                {stats.contractorCount}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Active contractors across all sites
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Zero Pay Warning & Root Cause Notification Banner */}
      {zeroPayIssues.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-200/70 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    Action Required: {zeroPayIssues.length} Contractor{zeroPayIssues.length > 1 ? 's' : ''} have Worked Hours with $0.00 Pay
                  </h3>
                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-[11px]">
                    Root Cause Detected
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {zeroPayIssues.map((issue, idx) => (
                    <div key={idx} className="text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-baseline gap-1">
                      <span className="font-bold text-amber-950 dark:text-amber-100">
                        • {issue.name} ({issue.location}, {issue.totalHours} hrs):
                      </span>
                      <span>{issue.reason}</span>
                      {issue.suggestion && (
                        <span className="text-amber-700 dark:text-amber-400 font-medium italic">
                          &rarr; {issue.suggestion}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveTab('summary');
                setOnlyZeroPay(!onlyZeroPay);
              }}
              className="shrink-0 h-8 text-xs border-amber-300 dark:border-amber-700 bg-amber-100/70 dark:bg-amber-900/40 hover:bg-amber-200 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
            >
              {onlyZeroPay ? 'Show All Contractors' : `Filter $0 Issues (${zeroPayIssues.length})`}
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Card with Tab Switcher */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold">
                {activeTab === 'summary' && 'Contractor Net Pay & Deductions Summary'}
                {activeTab === 'records' && 'Shift Records (Raw Timesheet)'}
                {activeTab === 'invoice' && `Invoice Summary (${customLocationName})`}
              </CardTitle>
              <CardDescription>
                {activeTab === 'summary' && 'Each contractor with their gross pay, deductions applied (Fixed, MOD, Once-only), and final net pay.'}
                {activeTab === 'records' && `All individual shift entries (${data.length} records).`}
                {activeTab === 'invoice' && `Daily shifts, rates, hours, and amounts matching client invoice format (${invoiceData.items.length} shifts).`}
              </CardDescription>
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <Button
                variant={activeTab === 'summary' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('summary')}
                className={`h-8 gap-1.5 text-xs font-medium ${
                  activeTab === 'summary' 
                    ? 'bg-white dark:bg-slate-900 text-foreground shadow-xs' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Contractor Summary ({summaries.length})
              </Button>
              <Button
                variant={activeTab === 'records' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('records')}
                className={`h-8 gap-1.5 text-xs font-medium ${
                  activeTab === 'records' 
                    ? 'bg-white dark:bg-slate-900 text-foreground shadow-xs' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Shift Rows ({data.length})
              </Button>
              <Button
                variant={activeTab === 'invoice' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('invoice')}
                className={`h-8 gap-1.5 text-xs font-medium ${
                  activeTab === 'invoice' 
                    ? 'bg-white dark:bg-slate-900 text-foreground shadow-xs' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Receipt className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Invoice Summary ({invoiceData.items.length})
              </Button>
            </div>
          </div>

          {/* Filtering bar for Contractor Summary */}
          {activeTab === 'summary' && data.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by name or location..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                {zeroPayIssues.length > 0 && (
                  <Button
                    variant={onlyZeroPay ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setOnlyZeroPay(!onlyZeroPay)}
                    className={`h-8 text-xs gap-1.5 cursor-pointer font-semibold ${
                      onlyZeroPay 
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-400 shadow-xs' 
                        : 'border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                    $0 Pay Issues ({zeroPayIssues.length})
                  </Button>
                )}
                <Button
                  variant={onlyWithDeductions ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setOnlyWithDeductions(!onlyWithDeductions)}
                  className={`h-8 text-xs gap-1.5 cursor-pointer ${
                    onlyWithDeductions 
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200' 
                      : ''
                  }`}
                >
                  <Scissors className="h-3.5 w-3.5 text-rose-500" />
                  Show Only Deductions ({stats.withDeductionsCount})
                </Button>
                {(onlyWithDeductions || onlyZeroPay) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOnlyWithDeductions(false);
                      setOnlyZeroPay(false);
                    }}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    Clear Filter
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {activeTab === 'summary' ? (
            /* TAB 1: CONTRACTOR SUMMARY VIEW (Net Pay & Deductions) */
            <div className="rounded-b-md overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead className="w-[220px]">Sub Contractor</TableHead>
                    <TableHead className="w-[160px]">Location</TableHead>
                    <TableHead className="text-right w-[90px]">Hours</TableHead>
                    <TableHead className="text-right w-[110px]">Gross Pay</TableHead>
                    <TableHead>Deductions & Adjustments</TableHead>
                    <TableHead className="text-right w-[120px]">Total Ded.</TableHead>
                    <TableHead className="text-right w-[120px]">Net Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                        Upload a timesheet to generate contractor payslips with deductions.
                      </TableCell>
                    </TableRow>
                  ) : filteredSummaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        No contractors match the current filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSummaries.map((s, i) => {
                      const hasDed = s.deductions.length > 0;
                      const issue = zeroPayIssues.find(z => cleanName(z.name) === cleanName(s.name) && cleanName(z.location) === cleanName(s.location));
                      const isZeroPay = !!issue;
                      return (
                        <TableRow 
                          key={`${s.cleanName}-${s.location}-${i}`}
                          className={
                            isZeroPay 
                              ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/40' 
                              : hasDed 
                              ? 'bg-rose-50/20 dark:bg-rose-950/10' 
                              : undefined
                          }
                        >
                          <TableCell className="font-semibold">
                            <div className="flex items-center gap-2">
                              <span className="whitespace-nowrap">{s.name}</span>
                              {isZeroPay && (
                                <Badge 
                                  variant="outline" 
                                  title={issue.reason}
                                  className="cursor-help text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 font-bold flex items-center gap-1 shrink-0"
                                >
                                  <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                                  $0.00 Pay
                                </Badge>
                              )}
                              {hasDed && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-rose-200 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 shrink-0">
                                  Deduction
                                </Badge>
                              )}
                              {s.opalAmount && s.opalAmount > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 shrink-0">
                                  Opal: +${s.opalAmount.toFixed(2)} ({s.opalDays}d)
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                              {s.location}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">{s.totalHours}</TableCell>
                          <TableCell className="text-right font-medium">${s.grossPay.toFixed(2)}</TableCell>
                          <TableCell>
                            {s.deductions.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">None</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {s.deductions.map((d, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border shadow-2xs ${
                                      d.amount < 0
                                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                                    }`}
                                  >
                                    <span>{d.amount < 0 ? `-$${Math.abs(d.amount).toFixed(2)}` : `+$${d.amount.toFixed(2)}`}</span>
                                    <span className="font-normal opacity-80">({d.label})</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {s.totalDeductions !== 0 ? (
                              <span className={s.totalDeductions < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                {s.totalDeductions < 0 ? `-$${Math.abs(s.totalDeductions).toFixed(2)}` : `+$${s.totalDeductions.toFixed(2)}`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">$0.00</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-bold text-sm ${
                                isZeroPay 
                                  ? 'text-amber-600 dark:text-amber-400' 
                                  : s.netPay <= 0 
                                  ? 'text-slate-900 dark:text-slate-100' 
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}>
                                ${s.netPay.toFixed(2)}
                              </span>
                              {s.uncollectedDeductions && s.uncollectedDeductions > 0 && (
                                <span 
                                  title={`Deductions exceeded gross pay by $${s.uncollectedDeductions.toFixed(2)}. Net pay capped at $0.00.`}
                                  className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold cursor-help inline-flex items-center gap-0.5"
                                >
                                  Uncollected: -${s.uncollectedDeductions.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : activeTab === 'invoice' ? (
            /* TAB 3: INVOICE SUMMARY VIEW (MATCHING CLIENT INVOICE EXCEL LAYOUT) */
            <div className="p-4 space-y-4">
              {/* Header Box (ZB Solution Invoicing Entity vs IHS Timesheet Summary) */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono">
                      {isCurrentIHS ? 'IHS HOSPITALITY' : 'ZB SOLUTION'}
                    </div>
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[11px] font-bold uppercase">
                      {isCurrentIHS ? 'Dynamic Timesheet Locations' : customLocationName}
                    </Badge>
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    From {periodStart || 'Period Start'} to {periodEnd || 'Period End'}
                  </div>

                  {/* Location Control: Dynamic for IHS, User-editable for ZB Solution */}
                  {!isCurrentIHS ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> Location Name:
                      </span>
                      <Input
                        type="text"
                        value={customLocationName}
                        onChange={e => setCustomLocationName(e.target.value)}
                        placeholder="Type location name (e.g. Ozone CPS)"
                        className="h-8 w-48 text-xs font-semibold bg-white dark:bg-slate-950 font-mono"
                      />
                      <div className="flex items-center gap-1">
                        {(['Ozone', 'Beyond'] as const).map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => {
                              setCustomLocationName(loc);
                              handleInvoiceLocationChange(loc);
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                              customLocationName === loc
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900'
                            }`}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      <span>Locations are loaded dynamically from each shift in the timesheet CSV.</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Live Rate Adjusters for Weekday & Weekend (ZB Solution hotel invoice charge rates) */}
                  {!isCurrentIHS && (
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5 px-2">
                        <span className="text-[11px] font-semibold text-slate-500">Weekdays:</span>
                        <div className="flex items-center text-xs font-mono font-bold">
                          <span>$</span>
                          <input
                            type="number"
                            step="0.5"
                            value={weekdayRate}
                            onChange={e => setWeekdayRate(parseFloat(e.target.value) || 0)}
                            className="w-14 text-right px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border-none focus:ring-1 focus:ring-blue-500 text-xs font-bold font-mono"
                            title="Rate charged to hotel for Mon - Fri shifts"
                          />
                        </div>
                      </div>
                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                      <div className="flex items-center gap-1.5 px-2">
                        <span className="text-[11px] font-semibold text-slate-500">Weekend:</span>
                        <div className="flex items-center text-xs font-mono font-bold">
                          <span>$</span>
                          <input
                            type="number"
                            step="0.5"
                            value={weekendRate}
                            onChange={e => setWeekendRate(parseFloat(e.target.value) || 0)}
                            className="w-14 text-right px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border-none focus:ring-1 focus:ring-blue-500 text-xs font-bold font-mono"
                            title="Rate charged to hotel for Sat & Sun shifts"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search staff, date..."
                      value={invoiceSearchQuery}
                      onChange={e => setInvoiceSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs bg-white dark:bg-slate-950"
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportInvoice}
                    disabled={data.length === 0}
                    className="h-9 gap-1.5 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-xs font-semibold"
                  >
                    <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    {isCurrentIHS ? 'Download Timesheet Summary (.xlsx)' : 'Download Invoice (.xlsx)'}
                  </Button>
                </div>
              </div>

              {/* Styled Table matching the Excel Spreadsheet */}
              <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-xs">
                <Table>
                  <TableHeader className="bg-[#8EA9DB] dark:bg-[#3b5998] text-slate-900 dark:text-white">
                    <TableRow className="hover:bg-transparent border-b border-slate-300 dark:border-slate-700">
                      <TableHead className="w-[120px] text-center font-bold text-slate-900 dark:text-white">Date</TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-slate-900 dark:text-white">Day</TableHead>
                      <TableHead className="font-bold text-slate-900 dark:text-white">Staff</TableHead>
                      <TableHead className="font-bold text-slate-900 dark:text-white">Location</TableHead>
                      <TableHead className="w-[110px] text-right font-bold text-slate-900 dark:text-white">Hour</TableHead>
                      <TableHead className="w-[120px] text-right font-bold text-slate-900 dark:text-white">Rate</TableHead>
                      <TableHead className="w-[140px] text-right font-bold text-slate-900 dark:text-white">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoiceItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-44 text-center text-muted-foreground">
                          {data.length === 0 ? 'Upload a timesheet to generate the Invoice Summary.' : 'No matching invoice records found.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoiceItems.map((item, idx) => (
                        <TableRow 
                          key={idx} 
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60 text-xs"
                        >
                          <TableCell className="text-center font-mono">{item.date}</TableCell>
                          <TableCell className="text-center font-medium text-muted-foreground">{item.day}</TableCell>
                          <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{item.staff}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-400">{item.location}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{item.hour}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">${item.rate.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            ${item.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredInvoiceItems.length > 0 && (
                    <tfoot className="bg-slate-50 dark:bg-slate-900/90 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                      <TableRow className="hover:bg-transparent text-xs sm:text-sm">
                        <TableCell colSpan={4} className="text-right pr-4 uppercase tracking-wider text-muted-foreground">
                          Grand Total
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {filteredInvoiceItems.reduce((s, it) => s + it.hour, 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right font-mono font-extrabold text-sm sm:text-base text-emerald-600 dark:text-emerald-400">
                          ${filteredInvoiceItems.reduce((s, it) => s + it.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              </div>
            </div>
          ) : (
            /* TAB 2: DETAILED SHIFT RECORDS VIEW */
            <div className="rounded-b-md overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Sub Contractor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                        Upload a timesheet to see results.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, i) => {
                      const summary = contractorDeductionsLookup.get(`${cleanName(row['Sub Contractor'])}|${cleanName(row.Location)}`);
                      const hasDed = summary && summary.deductions.length > 0;
                      const isZero = Number(row.Hours) > 0 && (row.Rate === 'Not Found' || Number(row.Rate) === 0 || Number(row.Total) === 0);

                      return (
                        <TableRow key={i} className={isZero ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                          <TableCell className="font-mono text-xs">{row['Timesheet date'] || '–'}</TableCell>
                          <TableCell>{row.Location}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{row['Sub Contractor']}</span>
                              {isZero && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 font-bold flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                                  $0 Pay
                                </Badge>
                              )}
                              {hasDed && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-rose-200 text-rose-600 bg-rose-50 dark:bg-rose-950/30">
                                  Ded: {summary.totalDeductions < 0 ? `-$${Math.abs(summary.totalDeductions).toFixed(2)}` : `$0`}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{row.Role}</TableCell>
                          <TableCell>{row['Pay Condition']}</TableCell>
                          <TableCell className="text-right font-medium">{row.Hours}</TableCell>
                          <TableCell className="text-right">
                            {row.Rate === 'Not Found' || Number(row.Rate) === 0 ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold text-xs inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Not Found ($0.00)
                              </span>
                            ) : (
                              <span className="text-muted-foreground">${row.Rate}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            <span className={isZero ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}>
                              ${row.Total}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
