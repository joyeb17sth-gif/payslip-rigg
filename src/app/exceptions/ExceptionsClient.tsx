'use client';

import { useState, useMemo } from 'react';
import { Deduction, CodeException, OnceOnlyException, ExceptionsData, ContractorDirectory } from '@/lib/data';
import { updateExceptions } from './actions';
import ContractorCombobox from './ContractorCombobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Save, Search, Plus, Trash2, CheckCircle2, Code2, DollarSign, Zap, CalendarDays, RefreshCw } from 'lucide-react';
import { 
  generatePayPeriodSuggestions, 
  isoToShortDate, 
  shortDateToISO, 
  parseDateFromShort 
} from '@/lib/payPeriods';
import { 
  getActivePayPeriod, 
  setActivePayPeriod, 
  PAY_PERIOD_EVENT, 
  normalizeSingleDate, 
  formatPeriodCompact,
  splitPeriodRange 
} from '@/lib/payPeriodStorage';
import { useEffect } from 'react';

const CLIENT_LOCATIONS: Record<string, string[]> = {
  IHS: ['ACE', 'Caption', 'Hyatt Regency', 'Park Hyatt', 'Q-Station', 'Shangrila'],
  ZBsolution: ['ZBS'],
};

export default function ExceptionsClient({ 
  initialData, 
  contractorDirectory = {} 
}: { 
  initialData: ExceptionsData; 
  contractorDirectory?: ContractorDirectory; 
}) {
  const [fixedData, setFixedData] = useState<Deduction[]>(initialData.fixed || []);
  const [codeData, setCodeData] = useState<CodeException[]>(initialData.codeBased || []);
  const [onceOnlyData, setOnceOnlyData] = useState<OnceOnlyException[]>(initialData.onceOnly || []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  
  // Pay Period state synchronized with Payslip Generator
  const [periodStart, setPeriodStart] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getActivePayPeriod().start || '01-Sep';
    }
    return '01-Sep';
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getActivePayPeriod().end || '07-Sep';
    }
    return '07-Sep';
  });

  const allPeriods = useMemo(
    () => generatePayPeriodSuggestions(periodStart, periodEnd), 
    [periodStart, periodEnd]
  );
  const presetPeriods = useMemo(() => [
    { start: '08-Sep', end: '15-Sep' },
    { start: '01-Sep', end: '07-Sep' },
    { start: '31-Aug', end: '06-Sep' },
    { start: '07-Sep', end: '13-Sep' },
  ], []);

  // Real-time synchronization across pages and tabs
  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<{ start: string; end: string }>;
      if (custom.detail) {
        if (custom.detail.start) setPeriodStart(custom.detail.start);
        if (custom.detail.end) setPeriodEnd(custom.detail.end);
      } else {
        const active = getActivePayPeriod();
        if (active.start) setPeriodStart(active.start);
        if (active.end) setPeriodEnd(active.end);
      }
    };
    window.addEventListener(PAY_PERIOD_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(PAY_PERIOD_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const handlePeriodChange = (start: string, end: string) => {
    setPeriodStart(start);
    setPeriodEnd(end);
    setActivePayPeriod(start, end);
  };

  const handleSyncAllOnceOnlyToActive = () => {
    const activeLabel = `${periodStart} to ${periodEnd}`;
    setOnceOnlyData(prev => prev.map(o => ({ ...o, payPeriod: activeLabel })));
  };

  const filteredFixed = fixedData.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.client.toLowerCase().includes(search.toLowerCase()) ||
    d.location.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCode = codeData.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.client.toLowerCase().includes(search.toLowerCase()) ||
    c.location.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOnceOnly = onceOnlyData.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.client.toLowerCase().includes(search.toLowerCase()) ||
    o.location.toLowerCase().includes(search.toLowerCase()) ||
    o.type.toLowerCase().includes(search.toLowerCase()) ||
    (o.payPeriod && o.payPeriod.toLowerCase().includes(search.toLowerCase())) ||
    (o.note && o.note.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    await updateExceptions({ fixed: fixedData, codeBased: codeData, onceOnly: onceOnlyData });
    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Fixed exceptions handlers
  const handleUpdateFixed = (id: string, field: keyof Deduction, value: string | number) => {
    setFixedData(prev => prev.map(d => {
      if (d.id !== id) return d;
      if (field === 'client') {
        const nextLocs = CLIENT_LOCATIONS[value as string] || ['ACE'];
        const nextLoc = nextLocs.includes(d.location) ? d.location : nextLocs[0];
        return { ...d, client: value as string, location: nextLoc };
      }
      return { ...d, [field]: value };
    }));
  };

  const handleDeleteFixed = (id: string) => {
    setFixedData(prev => prev.filter(d => d.id !== id));
  };

  const handleAddFixed = () => {
    const newId = `new-fixed-${Date.now()}`;
    setFixedData(prev => [
      { id: newId, client: 'IHS', location: 'Q-Station', name: 'NEW CONTRACTOR', amount: -10.00 },
      ...prev
    ]);
  };

  // Code-based exceptions handlers
  const handleUpdateCode = (id: string, field: keyof CodeException, value: any) => {
    setCodeData(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (field === 'client') {
        const nextLocs = CLIENT_LOCATIONS[value as string] || ['ACE'];
        const nextLoc = nextLocs.includes(c.location) ? c.location : nextLocs[0];
        return { ...c, client: value as string, location: nextLoc };
      }
      return { ...c, [field]: value };
    }));
  };

  const handleDeleteCode = (id: string) => {
    setCodeData(prev => prev.filter(c => c.id !== id));
  };

  const handleAddCode = () => {
    const newId = `new-code-${Date.now()}`;
    setCodeData(prev => [
      { 
        id: newId, 
        client: 'IHS', 
        location: 'Hyatt Regency', 
        name: 'HARISINGH', 
        rule: 'DEDUCT_EXCEPT_CODE', 
        code: 'MOD' 
      },
      ...prev
    ]);
  };

  // Once-Only exceptions handlers
  const handleUpdateOnceOnly = (id: string, field: keyof OnceOnlyException, value: any) => {
    setOnceOnlyData(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (field === 'client') {
        const nextLocs = CLIENT_LOCATIONS[value as string] || ['ACE'];
        const nextLoc = nextLocs.includes(o.location) ? o.location : nextLocs[0];
        const activeLabel = (periodStart && periodEnd) ? `${periodStart} to ${periodEnd}` : '01-Sep to 07-Sep';
        const nextPeriod = o.payPeriod || activeLabel;
        return { ...o, client: value as string, location: nextLoc, payPeriod: nextPeriod };
      }
      if (field === 'type') {
        const currentAbs = Math.abs(o.amount) || 50;
        const newAmt = value === 'Exceed' ? -currentAbs : currentAbs;
        return { ...o, type: value, amount: newAmt };
      }
      return { ...o, [field]: value };
    }));
  };

  const handleDeleteOnceOnly = (id: string) => {
    setOnceOnlyData(prev => prev.filter(o => o.id !== id));
  };

  const handleAddOnceOnly = () => {
    const newId = `new-once-${Date.now()}`;
    const defaultClient = 'IHS';
    const defaultLoc = 'Hyatt Regency';
    const locNames = contractorDirectory?.[defaultClient]?.[defaultLoc] || [];
    const defaultName = locNames[0] || '';
    const defaultPeriod = (periodStart && periodEnd)
      ? `${periodStart} to ${periodEnd}`
      : '01-Sep to 07-Sep';

    setOnceOnlyData(prev => [
      {
        id: newId,
        client: defaultClient,
        location: defaultLoc,
        name: defaultName,
        type: 'Short fall pay',
        amount: 50.00,
        payPeriod: defaultPeriod,
        note: '',
      },
      ...prev
    ]);
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Exceptions Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure contractor fixed dollar adjustments, dynamic shift code deductions, and once-only pay run adjustments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search exceptions..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 bg-background"
            />
          </div>
          {savedSuccess && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </div>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-sm">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save All Exceptions'}
          </Button>
        </div>
      </div>

      {/* Section 1: Once-Only Exceptions (Short fall pay & Exceed) - Top Priority */}
      <Card className="border-amber-200/80 dark:border-amber-900/60 shadow-sm">
        <CardHeader className="space-y-0 pb-4 border-b">
          <div className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-xl">Once-Only Exceptions</CardTitle>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                  Pay Run Adjustments (Once-Only)
                </span>
              </div>
              <CardDescription>
                Single-use adjustments for the current pay cycle. <strong>Short fall pay</strong> adds compensation (+), while <strong>Exceed</strong> deducts overpayments (-).
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleAddOnceOnly} className="gap-2 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 shrink-0">
              <Plus className="h-4 w-4 text-amber-600" />
              Add Once-Only Exception
            </Button>
          </div>
          {/* Pay period reference with full date picker support (choose any date in between) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-foreground font-semibold">
                <CalendarDays className="h-4 w-4 text-amber-600" />
                <span>Active Pay Period:</span>
              </div>

              {/* Native Date Pickers: Choose ANY date in between */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">From</span>
                  <input
                    type="date"
                    value={shortDateToISO(periodStart)}
                    onChange={(e) => {
                      const short = isoToShortDate(e.target.value);
                      if (short) handlePeriodChange(short, periodEnd);
                    }}
                    className="h-6 px-1.5 text-xs font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    title="Choose any start date in between"
                  />
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300 text-xs">({periodStart})</span>
                </div>

                <span className="text-muted-foreground font-bold">–</span>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">To</span>
                  <input
                    type="date"
                    value={shortDateToISO(periodEnd)}
                    onChange={(e) => {
                      const short = isoToShortDate(e.target.value);
                      if (short) handlePeriodChange(periodStart, short);
                    }}
                    className="h-6 px-1.5 text-xs font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    title="Choose any end date in between"
                  />
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300 text-xs">({periodEnd})</span>
                </div>
              </div>

              {/* Quick cycle presets */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-medium mr-0.5">Presets:</span>
                {presetPeriods.map((preset) => (
                  <button
                    key={`${preset.start}-${preset.end}`}
                    type="button"
                    onClick={() => handlePeriodChange(preset.start, preset.end)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer border ${
                      periodStart === preset.start && periodEnd === preset.end
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset.start}–{preset.end}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSyncAllOnceOnlyToActive}
                className="h-7 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 gap-1.5 px-2.5 cursor-pointer rounded-lg border border-amber-200/70 dark:border-amber-900/60"
                title={`Set pay period of all once-only exceptions to ${periodStart} to ${periodEnd}`}
              >
                <RefreshCw className="h-3 w-3" />
                Sync all exceptions to {periodStart}–{periodEnd}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-md border overflow-x-auto relative">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="w-[110px]">Client</TableHead>
                  <TableHead className="w-[150px]">Location</TableHead>
                  <TableHead className="w-[200px]">Contractor Name</TableHead>
                  <TableHead className="min-w-[220px]">Pay Period / Date</TableHead>
                  <TableHead className="w-[170px]">Adjustment Type</TableHead>
                  <TableHead className="w-[130px] text-right">Amount ($)</TableHead>
                  <TableHead className="min-w-[200px]">Reason / Notes</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOnceOnly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No once-only exceptions configured. Click &quot;Add Once-Only Exception&quot; to add a Short fall pay or Exceed adjustment.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOnceOnly.map((o) => {
                    const isPositive = o.amount >= 0;
                    const locs = CLIENT_LOCATIONS[o.client] || ['ACE'];
                    const clientPeriods = allPeriods.filter(p => p.client === o.client);
                    const currentPeriodVal = o.payPeriod || (periodStart && periodEnd ? `${periodStart} to ${periodEnd}` : clientPeriods[0]?.label || '');
                    const isCustomPeriod = Boolean(
                      o.payPeriod && 
                      o.payPeriod !== `${periodStart} to ${periodEnd}` && 
                      !clientPeriods.some(p => p.label === o.payPeriod)
                    );
                    const parts = splitPeriodRange(o.payPeriod || '');
                    const rowStart = parts[0] || periodStart;
                    const rowEnd = parts.length > 1 ? parts[1] : parts[0] || periodEnd;

                    return (
                      <TableRow key={o.id}>
                        {/* Client select */}
                        <TableCell>
                          <select
                            value={o.client}
                            onChange={(e) => handleUpdateOnceOnly(o.id, 'client', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            <option value="IHS">IHS</option>
                            <option value="ZBsolution">ZBsolution</option>
                          </select>
                        </TableCell>

                        {/* Location select */}
                        <TableCell>
                          <select
                            value={o.location}
                            onChange={(e) => handleUpdateOnceOnly(o.id, 'location', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            {locs.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </TableCell>

                        {/* Contractor Name Combobox */}
                        <TableCell className="font-medium min-w-[200px]">
                          <ContractorCombobox
                            value={o.name}
                            onChange={(val) => handleUpdateOnceOnly(o.id, 'name', val.toUpperCase())}
                            client={o.client}
                            location={o.location}
                            directory={contractorDirectory}
                            placeholder="Select or search contractor..."
                          />
                        </TableCell>

                        {/* Pay Period / Custom Date in between */}
                        <TableCell className="min-w-[220px]">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                              <select
                                value={isCustomPeriod ? '__CUSTOM__' : currentPeriodVal}
                                onChange={(e) => {
                                  if (e.target.value === '__CUSTOM__') {
                                    handleUpdateOnceOnly(o.id, 'payPeriod', periodStart);
                                  } else {
                                    handleUpdateOnceOnly(o.id, 'payPeriod', e.target.value);
                                  }
                                }}
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                              >
                                {periodStart && periodEnd && (
                                  <option value={`${periodStart} to ${periodEnd}`}>
                                    {periodStart}–{periodEnd} · Active Run
                                  </option>
                                )}
                                {isCustomPeriod && (
                                  <option value="__CUSTOM__">
                                    📅 Custom: {o.payPeriod}
                                  </option>
                                )}
                                {clientPeriods.map((p) => {
                                  if (periodStart && periodEnd && p.label === `${periodStart} to ${periodEnd}`) return null;
                                  return (
                                    <option key={p.periodKey} value={p.label}>
                                      {p.startFormatted}–{p.endFormatted}
                                    </option>
                                  );
                                })}
                                {!isCustomPeriod && (
                                  <option value="__CUSTOM__">📅 Choose custom date in between...</option>
                                )}
                              </select>

                              {/* Native Date Picker trigger */}
                              <div 
                                className="relative inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-300 cursor-pointer overflow-hidden shrink-0 shadow-2xs" 
                                title="Pick any date in between"
                              >
                                <CalendarDays className="h-4 w-4 text-amber-600 pointer-events-none" />
                                <input
                                  type="date"
                                  value={shortDateToISO(rowStart)}
                                  onChange={(e) => {
                                    const short = isoToShortDate(e.target.value);
                                    if (short) handleUpdateOnceOnly(o.id, 'payPeriod', short);
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                  title="Pick date in between"
                                />
                              </div>
                            </div>

                            {/* In-between Date Pickers (Shown when custom date is chosen) */}
                            {isCustomPeriod && (
                              <div className="flex items-center gap-1.5 text-[11px] bg-amber-50/70 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-900/50">
                                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">From</span>
                                <input
                                  type="date"
                                  value={shortDateToISO(rowStart)}
                                  onChange={(e) => {
                                    const short = isoToShortDate(e.target.value);
                                    if (short) {
                                      const newPeriod = rowEnd && rowEnd !== rowStart && rowEnd !== short ? `${short} to ${rowEnd}` : short;
                                      handleUpdateOnceOnly(o.id, 'payPeriod', newPeriod);
                                    }
                                  }}
                                  className="h-5 px-1 text-[11px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded focus:outline-none cursor-pointer"
                                  title="Pick start date in between"
                                />
                                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">To</span>
                                <input
                                  type="date"
                                  value={shortDateToISO(rowEnd)}
                                  onChange={(e) => {
                                    const short = isoToShortDate(e.target.value);
                                    if (short) {
                                      const newPeriod = rowStart && rowStart !== short ? `${rowStart} to ${short}` : short;
                                      handleUpdateOnceOnly(o.id, 'payPeriod', newPeriod);
                                    }
                                  }}
                                  className="h-5 px-1 text-[11px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded focus:outline-none cursor-pointer"
                                  title="Pick end date in between"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOnceOnly(o.id, 'payPeriod', `${periodStart} to ${periodEnd}`)}
                                  className="ml-auto text-slate-400 hover:text-rose-600 font-bold px-1"
                                  title="Reset to Active Run"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Adjustment Type select */}
                        <TableCell>
                          <select
                            value={o.type}
                            onChange={(e) => handleUpdateOnceOnly(o.id, 'type', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            <option value="Short fall pay">Short fall pay (+ Addition)</option>
                            <option value="Exceed">Exceed (- Deduction)</option>
                          </select>
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="text-right">
                          <div className="relative inline-flex items-center w-full max-w-[130px] ml-auto">
                            <span className={`absolute left-2.5 text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isPositive ? '+' : '-'} $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={Math.abs(o.amount)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const signed = o.type === 'Exceed' ? -Math.abs(val) : Math.abs(val);
                                handleUpdateOnceOnly(o.id, 'amount', signed);
                              }}
                              className={`h-8 w-full pl-8 pr-2 text-right rounded-md border font-mono font-bold text-xs focus:outline-none ${
                                isPositive
                                  ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 focus:border-emerald-500'
                                  : 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-950/20 focus:border-rose-500'
                              }`}
                            />
                          </div>
                        </TableCell>

                        {/* Notes */}
                        <TableCell>
                          <Input
                            value={o.note || ''}
                            onChange={(e) => handleUpdateOnceOnly(o.id, 'note', e.target.value)}
                            className="h-8 w-full text-xs"
                            placeholder="e.g. Underpaid 2.5 hrs last pay run"
                          />
                        </TableCell>

                        {/* Delete Action */}
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteOnceOnly(o.id)} title="Delete once-only exception">
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Code-Based Exceptions */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600" />
              <CardTitle className="text-xl">Code-Based Exceptions</CardTitle>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
                Dynamic Deductions
              </span>
            </div>
            <CardDescription>
              Deduct contractor cash/earnings dynamically based on their shift codes (e.g. Hari Singh deducts all cash except MOD code).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddCode} className="gap-2 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50">
            <Plus className="h-4 w-4 text-indigo-600" />
            Add Code Exception
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-md border overflow-x-auto relative">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="w-[120px]">Client</TableHead>
                  <TableHead className="w-[160px]">Location</TableHead>
                  <TableHead className="w-[200px]">Contractor Name</TableHead>
                  <TableHead className="w-[240px]">Deduction Rule</TableHead>
                  <TableHead className="w-[130px]">Target Code</TableHead>
                  <TableHead className="min-w-[200px]">Rule Summary</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCode.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No code-based exceptions configured. Click &quot;Add Code Exception&quot; to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCode.map((c) => {
                    const isExceptRule = c.rule === 'DEDUCT_EXCEPT_CODE';
                    const targetCodeUpper = (c.code || 'MOD').trim().toUpperCase();
                    const locs = CLIENT_LOCATIONS[c.client] || ['ACE'];

                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <select
                            value={c.client}
                            onChange={(e) => handleUpdateCode(c.id, 'client', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            <option value="IHS">IHS</option>
                            <option value="ZBsolution">ZBsolution</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            value={c.location}
                            onChange={(e) => handleUpdateCode(c.id, 'location', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            {locs.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </TableCell>
                        {/* Contractor Name Combobox */}
                        <TableCell className="font-medium min-w-[220px]">
                          <ContractorCombobox
                            value={c.name}
                            onChange={(val) => handleUpdateCode(c.id, 'name', val.toUpperCase())}
                            client={c.client}
                            location={c.location}
                            directory={contractorDirectory}
                            placeholder="Select or search contractor..."
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={c.rule}
                            onChange={(e) => handleUpdateCode(c.id, 'rule', e.target.value as any)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="DEDUCT_EXCEPT_CODE">Deduct all cash except code</option>
                            <option value="DEDUCT_SPECIFIC_CODE">Deduct cash for this specific code</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={c.code} 
                            onChange={(e) => handleUpdateCode(c.id, 'code', e.target.value.toUpperCase())}
                            className="h-8 w-full font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase"
                            placeholder="e.g. MOD"
                          />
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md ${
                            isExceptRule 
                              ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' 
                              : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                          }`}>
                            {isExceptRule 
                              ? `Deducts all non-${targetCodeUpper} pay (pays only ${targetCodeUpper})`
                              : `Deducts all pay for ${targetCodeUpper} code`
                            }
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteCode(c.id)} title="Delete code exception">
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Fixed Amount Exceptions */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-xl">Fixed Amount Exceptions</CardTitle>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                Recurring Deductions
              </span>
            </div>
            <CardDescription>
              Fixed dollar shortfalls (negative) and adjustments deducted from or added to contractor net pay on every cycle.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddFixed} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Fixed Exception
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-md border max-h-[500px] overflow-auto relative">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[140px]">Client</TableHead>
                  <TableHead className="w-[180px]">Location</TableHead>
                  <TableHead>Contractor Name</TableHead>
                  <TableHead className="text-right w-[150px]">Amount ($)</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFixed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No fixed amount exceptions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFixed.map((d) => {
                    const isNegative = d.amount < 0;
                    const locs = CLIENT_LOCATIONS[d.client] || ['ACE'];

                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <select
                            value={d.client}
                            onChange={(e) => handleUpdateFixed(d.id, 'client', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            <option value="IHS">IHS</option>
                            <option value="ZBsolution">ZBsolution</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            value={d.location}
                            onChange={(e) => handleUpdateFixed(d.id, 'location', e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            {locs.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </TableCell>
                        {/* Contractor Name Combobox */}
                        <TableCell className="font-medium min-w-[220px]">
                          <ContractorCombobox
                            value={d.name}
                            onChange={(val) => handleUpdateFixed(d.id, 'name', val.toUpperCase())}
                            client={d.client}
                            location={d.location}
                            directory={contractorDirectory}
                            placeholder="Select or search contractor..."
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input 
                            type="number"
                            step="0.01"
                            value={d.amount} 
                            onChange={(e) => handleUpdateFixed(d.id, 'amount', parseFloat(e.target.value) || 0)}
                            className={`h-8 w-[120px] ml-auto text-right font-bold ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteFixed(d.id)} title="Delete fixed exception">
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
