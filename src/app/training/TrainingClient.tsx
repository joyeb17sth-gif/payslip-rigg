'use client';

import { useState, useMemo } from 'react';
import { TrainingRecord } from '@/lib/data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getTrainingRecords, markPaid, forceRelease, updateTraineeStatus } from '@/app/training/actions';
import { Button } from '@/components/ui/button';
import { CheckCircle, DollarSign, Clock, CalendarDays } from 'lucide-react';
import { generatePayPeriodSuggestions } from '@/lib/payPeriods';


export default function TrainingClient({ initialData }: { initialData: TrainingRecord[] }) {
  const [data, setData] = useState<TrainingRecord[]>(initialData);
  const [loading, setLoading] = useState(false);

  const allPeriods = useMemo(() => generatePayPeriodSuggestions(), []);
  const recentIhs = useMemo(() => allPeriods.filter(p => p.client === 'IHS').slice(0, 1), [allPeriods]);
  const recentZb = useMemo(() => allPeriods.filter(p => p.client === 'ZBsolution').slice(0, 1), [allPeriods]);

  const refresh = async () => {
    const updated = await getTrainingRecords();
    setData(updated);
  };

  const handleMarkPaid = async (name: string, location: string) => {
    setLoading(true);
    await markPaid(name, location);
    await refresh();
    setLoading(false);
  };

  const handleForceRelease = async (name: string, location: string) => {
    setLoading(true);
    await forceRelease(name, location);
    await refresh();
    setLoading(false);
  };

  const handleStatusChange = async (name: string, location: string, newStatus: string) => {
    setLoading(true);
    await updateTraineeStatus(name, location, newStatus);
    await refresh();
    setLoading(false);
  };

  const statusColors: Record<string, string> = {
    'Released': 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300',
    'Ready to Pay': 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300',
    'PAID': 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300',
    'Waiting': 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300',
    'Training': 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-400',
  };

  const getLatestTrainingDate = (r: TrainingRecord): string => {
    if (r.training_dates && r.training_dates.length > 0) {
      const sorted = [...r.training_dates].sort();
      return sorted[sorted.length - 1];
    }
    return r.target_release_week || '—';
  };

  // Keep most recent training dates at the top
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const getLatestTimestamp = (r: TrainingRecord): number => {
        if (r.training_dates && r.training_dates.length > 0) {
          const sorted = [...r.training_dates].sort();
          const d = new Date(sorted[sorted.length - 1]).getTime();
          if (!isNaN(d)) return d;
        }
        if (r.target_release_week) {
          const d = new Date(r.target_release_week).getTime();
          if (!isNaN(d)) return d;
        }
        return 0;
      };
      return getLatestTimestamp(b) - getLatestTimestamp(a);
    });
  }, [data]);

  // Summaries
  const releasedCount = data.filter(d => d.status === 'Released' || d.status === 'Ready to Pay').length;
  const paidCount = data.filter(d => d.status === 'PAID').length;
  const waitingCount = data.filter(d => d.status === 'Waiting').length;
  const trainingCount = data.filter(d => d.status === 'Training').length;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Training Tracker</h1>
        <p className="text-muted-foreground">Monitor trainee progression, pay releases, and payment disbursements.</p>
      </div>

      {/* Pay Period Reference Banner */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground font-semibold shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Pay Period Reference</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-500">IHS</span>
              {recentIhs.map(p => (
                <span key={p.periodKey} className="font-mono text-teal-800 dark:text-teal-300">{p.startFormatted}–{p.endFormatted}</span>
              ))}
            </div>
            <div className="h-3.5 w-px bg-border hidden sm:block" />
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-500">ZBS</span>
              {recentZb.map(p => (
                <span key={p.periodKey} className="font-mono text-violet-800 dark:text-violet-300">{p.startFormatted}–{p.endFormatted}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-900 dark:text-amber-300">Released (Pending Pay)</CardTitle>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-950 dark:text-amber-200">{releasedCount}</div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">Ready for upcoming payslip run</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Training</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trainingCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Accumulating 5 training days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Waiting</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waitingCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">5 days complete · holding for release</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Paid (Disbursed)</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">{paidCount}</div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">Physically paid · excluded from new runs</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="w-[220px]">Trainee Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">Days (Target 5)</TableHead>
                <TableHead className="text-center">Total Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Release Week</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    No training records found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((row, i) => (
                    <TableRow key={row.name + row.location || i}>
                      <TableCell className="font-medium">
                        <div>{row.name}</div>
                        {row.training_dates && row.training_dates.length > 0 && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            Recent: {getLatestTrainingDate(row)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.location}>
                        {row.location}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold">
                        <span className={(row.training_dates?.length || 0) >= 5 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                          {row.training_dates?.length || 0} / 5
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-medium">{row.total_hours || 0}</TableCell>
                      <TableCell>
                        <select
                          value={row.status === 'Ready to Pay' ? 'Released' : row.status}
                          onChange={(e) => handleStatusChange(row.name, row.location, e.target.value)}
                          disabled={loading}
                          className={`h-7 rounded-md border text-xs font-semibold px-2 py-0.5 cursor-pointer outline-none transition-colors ${
                            statusColors[row.status] || 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          <option value="Released" className="bg-background text-foreground">Released (Ready for Payslip)</option>
                          <option value="Training" className="bg-background text-foreground">In Training</option>
                          <option value="Waiting" className="bg-background text-foreground">Waiting</option>
                          <option value="PAID" className="bg-background text-foreground">PAID (Disbursed)</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.target_release_week || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-4 whitespace-nowrap">
                        {row.status === 'PAID' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Paid / Disbursed
                          </span>
                        )}
                        {(row.status === 'Released' || row.status === 'Ready to Pay') && (
                          <Button 
                            size="sm" 
                            variant="default" 
                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-medium"
                            onClick={() => handleMarkPaid(row.name, row.location)}
                            disabled={loading}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Mark Paid
                          </Button>
                        )}
                        {(row.status === 'Training' || row.status === 'Waiting') && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                            onClick={() => handleForceRelease(row.name, row.location)}
                            disabled={loading}
                          >
                            Release Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
