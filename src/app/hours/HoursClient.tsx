'use client';

import { useState, useMemo, useRef } from 'react';
import { parseHoursTimesheet, HoursRecord } from '@/lib/calculators';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, UploadCloud, Search, Clock, Users, Calendar, AlertCircle, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export type { HoursRecord };

export default function HoursClient() {
  const [data, setData] = useState<HoursRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setFileName(file.name);
      setStatusMessage(null);
      const buffer = await file.arrayBuffer();
      const records = parseHoursTimesheet(buffer, file.name);

      if (records.length === 0) {
        setStatusMessage({
          type: 'warning',
          text: `No shift records found in "${file.name}". Please ensure your file contains contractor names, dates, and hours/duration (or start/end times).`
        });
        setData([]);
      } else {
        const totalHrs = records.reduce((sum, r) => sum + r.hours, 0);
        setStatusMessage({
          type: 'success',
          text: `Successfully extracted ${records.length} records (${totalHrs.toFixed(2)} total hours) from "${file.name}".`
        });
        setData(records);
      }
    } catch (err: any) {
      console.error('Error parsing timesheet:', err);
      setStatusMessage({
        type: 'error',
        text: `Failed to parse "${file.name}": ${err?.message || 'Unknown error'}`
      });
      setData([]);
    } finally {
      // Clear file input value so user can re-upload the same file after an edit
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleExport = () => {
    if (data.length === 0) return;
    const exportRows = data.map(r => ({
      name: r.name,
      role: r.role || '',
      date: r.date,
      start: r.start,
      end: r.end,
      hours: r.hours
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Calculated Hours");
    const exportName = fileName ? `Calculated_${fileName.replace(/\.[^/.]+$/, "")}.csv` : "Calculated_Hours.csv";
    XLSX.writeFile(wb, exportName);
  };

  // Filtered data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase().trim();
    return data.filter(r => 
      r.name.toLowerCase().includes(q) ||
      (r.role && r.role.toLowerCase().includes(q)) ||
      r.date.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalHours = data.reduce((sum, r) => sum + r.hours, 0);
    const uniqueContractors = new Set(data.map(r => r.name.toLowerCase())).size;
    const weekendShifts = data.filter(r => {
      const dt = new Date(r.date);
      return !isNaN(dt.getTime()) && (dt.getDay() === 0 || dt.getDay() === 6);
    }).length;

    return {
      totalRecords: data.length,
      totalHours: Math.round(totalHours * 100) / 100,
      uniqueContractors,
      weekendShifts
    };
  }, [data]);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hours Calculator</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Extract and calculate hours from raw timesheet exports, rosters, and CSV reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="relative gap-2 cursor-pointer shadow-sm">
            <UploadCloud className="h-4 w-4" />
            Load Timesheet
            <input 
              ref={fileInputRef}
              type="file" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={data.length === 0} 
            className="gap-2 shadow-sm bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            <Download className="h-4 w-4" />
            Export Results
          </Button>
        </div>
      </div>

      {/* Notification / Alert */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300'
            : statusMessage.type === 'warning'
            ? 'bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-300'
            : 'bg-rose-50/80 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-300'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-semibold capitalize">{statusMessage.type}: </span>
            {statusMessage.text}
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
                <FileSpreadsheet className="h-3.5 w-3.5 text-blue-500" />
                Total Shifts
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{stats.totalRecords}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
                <Clock className="h-3.5 w-3.5 text-teal-500" />
                Total Hours
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {stats.totalHours.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
                <Users className="h-3.5 w-3.5 text-indigo-500" />
                Contractors
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{stats.uniqueContractors}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs font-medium">
                <Calendar className="h-3.5 w-3.5 text-orange-500" />
                Weekend Shifts
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {stats.weekendShifts}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Main Table Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">
                Timesheet Data ({filteredData.length} records)
              </CardTitle>
              {fileName && (
                <Badge variant="outline" className="text-xs font-normal border-slate-300 dark:border-slate-700">
                  {fileName}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Processed shifts and calculated work durations.
            </CardDescription>
          </div>

          {data.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search contractor, role, date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Sub Contractor</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Role</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Date</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Start Time</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">End Time</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                      {data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-6">
                          <UploadCloud className="h-9 w-9 text-muted-foreground/60 stroke-[1.5]" />
                          <p className="font-medium text-slate-600 dark:text-slate-400">Upload a timesheet to calculate hours</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            Supports CSV exports (e.g. 123.csv), Deputy schedules, Vendor reports, and Rydges/Hotel grid rosters (.csv, .xlsx, .xls).
                          </p>
                        </div>
                      ) : (
                        <div className="py-6">
                          <p className="font-medium">No results matching &quot;{searchQuery}&quot;</p>
                          <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row, i) => {
                    const dt = new Date(row.date);
                    const isWeekend = !isNaN(dt.getTime()) && (dt.getDay() === 0 || dt.getDay() === 6);
                    const dayName = !isNaN(dt.getTime()) 
                      ? dt.toLocaleDateString('en-AU', { weekday: 'short' }) 
                      : '';
                    
                    return (
                      <TableRow 
                        key={i} 
                        className={isWeekend ? "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/10 dark:hover:bg-amber-950/20" : ""}
                      >
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {row.role || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{row.date}</span>
                            {dayName && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                isWeekend 
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' 
                                  : 'text-muted-foreground'
                              }`}>
                                {dayName}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 font-mono text-xs">
                          {row.start}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 font-mono text-xs">
                          {row.end}
                        </TableCell>
                        <TableCell className="text-right font-semibold font-mono text-teal-600 dark:text-teal-400">
                          {row.hours.toFixed(2)}
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
