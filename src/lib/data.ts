import fs from 'fs/promises';
import path from 'path';
import { isSupabaseConfigured, getSupabaseClient } from './supabase';

// File locations: checks local project data/ folder (for Vercel/cloud) and parent root (for local bot)
async function getExistingFilePath(filename: string): Promise<string> {
  const parentPath = path.join(process.cwd(), '..', filename);
  try {
    await fs.access(parentPath);
    return parentPath;
  } catch {}

  const localDataPath = path.join(process.cwd(), 'data', filename);
  try {
    await fs.access(localDataPath);
    return localDataPath;
  } catch {}

  return parentPath;
}

export async function readJsonFile<T>(filename: string, defaultData: T): Promise<T> {
  try {
    const filePath = await getExistingFilePath(filename);
    const data = await fs.readFile(/* turbopackIgnore: true */ filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return defaultData;
    }
    console.error(`Error reading ${filename}:`, error);
    return defaultData;
  }
}

export async function writeJsonFile<T>(filename: string, data: T): Promise<boolean> {
  let written = false;

  // 1. Write to parent directory if available (keeps local python bot in sync)
  try {
    const parentPath = path.join(process.cwd(), '..', filename);
    const tempPath = `${parentPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 4), 'utf-8');
    await fs.rename(tempPath, parentPath);
    written = true;
  } catch {}

  // 2. Also write to bundled data directory
  try {
    const localDataPath = path.join(process.cwd(), 'data', filename);
    const tempPath = `${localDataPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 4), 'utf-8');
    await fs.rename(tempPath, localDataPath);
    written = true;
  } catch {}

  return written;
}

// --- High Performance In-Memory Cache (60s TTL, auto-invalidated on updates) ---
const CACHE_TTL_MS = 60 * 1000;
let cacheRates: { data: ContractorRate[]; expires: number } | null = null;
let cacheExceptions: { data: ExceptionsData; expires: number } | null = null;
let cacheTraining: { data: TrainingRecord[]; expires: number } | null = null;
let cacheInvoiceRates: { data: InvoiceRateItem[]; expires: number } | null = null;
let cacheCompletedPeriods: { data: string[]; expires: number } | null = null;

// --- Specific Data Accessors ---

// The raw JSON shapes
type RawRatesData = Record<string, Record<string, Record<string, Record<string, number>>>>;
type RawDeductionsData = Record<string, Record<string, Record<string, number | string>>>;

export interface ContractorRate {
  id: string; // unique key for react
  client: string;
  location: string;
  name: string;
  dayType: string;
  rate: number;
}

export async function getRates(): Promise<ContractorRate[]> {
  // 0. Return from in-memory cache if fresh
  if (cacheRates && Date.now() < cacheRates.expires) {
    return cacheRates.data;
  }

  // 1. If Supabase is configured, fetch live synced rates from PostgreSQL
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('contractor_rates').select('*');
      if (!error && data && data.length > 0) {
        const records = data.map(r => ({
          id: r.id,
          client: r.client,
          location: r.location,
          name: r.name,
          dayType: r.day_type,
          rate: Number(r.rate) || 0,
        }));
        cacheRates = { data: records, expires: Date.now() + CACHE_TTL_MS };
        return records;
      }
    }
  }

  // 2. Offline / Local fallback to contractor_rates.json
  const raw = await readJsonFile<RawRatesData>('contractor_rates.json', {});
  const records: ContractorRate[] = [];

  for (const client in raw) {
    for (const location in raw[client]) {
      for (const name in raw[client][location]) {
        for (const dayType in raw[client][location][name]) {
          records.push({
            id: `${client}|${location}|${name}|${dayType}`,
            client,
            location,
            name,
            dayType,
            rate: raw[client][location][name][dayType],
          });
        }
      }
    }
  }

  cacheRates = { data: records, expires: Date.now() + CACHE_TTL_MS };
  return records;
}

export async function saveRates(rates: ContractorRate[]): Promise<boolean> {
  // Invalidate cache immediately so new rates are active instantly
  cacheRates = null;

  // 1. If Supabase is configured, sync to PostgreSQL
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const rows = rates.map(r => ({
        id: r.id || `${r.client}|${r.location}|${r.name}|${r.dayType}`,
        client: r.client,
        location: r.location,
        name: r.name,
        day_type: r.dayType,
        rate: parseFloat(String(r.rate)) || 0,
        updated_at: new Date().toISOString(),
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from('contractor_rates').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Error syncing rates to Supabase:', error);
        }
      }
    }
  }

  // 2. Always persist locally if file write is available
  const raw: RawRatesData = {};
  
  for (const r of rates) {
    if (!raw[r.client]) raw[r.client] = {};
    if (!raw[r.client][r.location]) raw[r.client][r.location] = {};
    if (!raw[r.client][r.location][r.name]) raw[r.client][r.location][r.name] = {};
    
    raw[r.client][r.location][r.name][r.dayType] = parseFloat(String(r.rate)) || 0;
  }

  await writeJsonFile('contractor_rates.json', raw);
  return true;
}

export interface Deduction {
  id: string;
  client: string;
  location: string;
  name: string;
  amount: number;
}

export interface CodeException {
  id: string;
  client: string;
  location: string;
  name: string;
  rule: 'DEDUCT_EXCEPT_CODE' | 'DEDUCT_SPECIFIC_CODE';
  code: string;
}

export interface OnceOnlyException {
  id: string;
  client: string;
  location: string;
  name: string;
  type: 'Short fall pay' | 'Exceed' | string;
  amount: number;
  payPeriod?: string; // e.g. "31-Aug to 06-Sep"
  note?: string;
}

export interface ExceptionsData {
  fixed: Deduction[];
  codeBased: CodeException[];
  onceOnly: OnceOnlyException[];
}

export async function getExceptionsData(): Promise<ExceptionsData> {
  // 0. Return from in-memory cache if fresh
  if (cacheExceptions && Date.now() < cacheExceptions.expires) {
    return cacheExceptions.data;
  }

  // 1. If Supabase is configured, fetch live exceptions concurrently
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const [dedsRes, onceRes] = await Promise.all([
        supabase.from('contractor_deductions').select('*'),
        supabase.from('once_only_exceptions').select('*')
      ]);

      const deds = dedsRes.data;
      const once = onceRes.data;
      if ((deds && deds.length > 0) || (once && once.length > 0)) {
        const fixed: Deduction[] = [];
        const codeBased: CodeException[] = [];

        for (const d of (deds || [])) {
          if (d.rule_type === 'fixed') {
            fixed.push({
              id: d.id,
              client: d.client,
              location: d.location,
              name: d.name,
              amount: Number(d.amount) || 0,
            });
          } else {
            const ruleStr = (d.code_rule || 'MOD').trim().toUpperCase();
            let rule: 'DEDUCT_EXCEPT_CODE' | 'DEDUCT_SPECIFIC_CODE' = 'DEDUCT_EXCEPT_CODE';
            let code = 'MOD';

            if (ruleStr.startsWith('DEDUCT:')) {
              rule = 'DEDUCT_SPECIFIC_CODE';
              code = ruleStr.substring(7).trim() || 'MOD';
            } else if (ruleStr.startsWith('EXCEPT:')) {
              rule = 'DEDUCT_EXCEPT_CODE';
              code = ruleStr.substring(7).trim() || 'MOD';
            }

            codeBased.push({
              id: d.id,
              client: d.client,
              location: d.location,
              name: d.name,
              rule,
              code,
            });
          }
        }

        const onceOnly: OnceOnlyException[] = (once || []).map(o => ({
          id: o.id,
          client: o.client,
          location: o.location,
          name: o.name,
          type: o.type,
          amount: Number(o.amount) || 0,
          payPeriod: o.pay_period,
          note: o.note,
        }));

        const result = { fixed, codeBased, onceOnly };
        cacheExceptions = { data: result, expires: Date.now() + CACHE_TTL_MS };
        return result;
      }
    }
  }

  // 2. Offline / Local fallback to contractor_deductions.json & once_only_exceptions.json
  const raw = await readJsonFile<RawDeductionsData>('contractor_deductions.json', {});
  const onceOnly = await readJsonFile<OnceOnlyException[]>('once_only_exceptions.json', []);
  const fixed: Deduction[] = [];
  const codeBased: CodeException[] = [];

  for (const client in raw) {
    for (const location in raw[client]) {
      for (const name in raw[client][location]) {
        const val = raw[client][location][name];
        const normName = name.replace(/\s+/g, '').toUpperCase();

        if (typeof val === 'string') {
          const valUpper = val.toUpperCase().trim();
          let rule: 'DEDUCT_EXCEPT_CODE' | 'DEDUCT_SPECIFIC_CODE' = 'DEDUCT_EXCEPT_CODE';
          let targetCode = 'MOD';

          if (valUpper.includes('ALL_PAY_MOD') || valUpper.includes('ALL PAY ON MOD') || valUpper === 'MOD') {
            rule = 'DEDUCT_EXCEPT_CODE';
            targetCode = 'MOD';
          } else if (valUpper.startsWith('EXCEPT:')) {
            rule = 'DEDUCT_EXCEPT_CODE';
            targetCode = valUpper.substring(7).trim() || 'MOD';
          } else if (valUpper.startsWith('DEDUCT:')) {
            rule = 'DEDUCT_SPECIFIC_CODE';
            targetCode = valUpper.substring(7).trim() || 'MOD';
          } else {
            rule = 'DEDUCT_EXCEPT_CODE';
            targetCode = valUpper;
          }

          codeBased.push({
            id: `code-${client}|${location}|${name}`,
            client,
            location,
            name,
            rule,
            code: targetCode,
          });
        } else {
          if (normName === 'HARISINGH' && val === 0) {
            codeBased.push({
              id: `code-${client}|${location}|${name}`,
              client,
              location,
              name,
              rule: 'DEDUCT_EXCEPT_CODE',
              code: 'MOD',
            });
          } else {
            fixed.push({
              id: `fixed-${client}|${location}|${name}`,
              client,
              location,
              name,
              amount: typeof val === 'number' ? val : (parseFloat(val) || 0),
            });
          }
        }
      }
    }
  }

  const result = { fixed, codeBased, onceOnly: onceOnly || [] };
  cacheExceptions = { data: result, expires: Date.now() + CACHE_TTL_MS };
  return result;
}

export async function saveExceptionsData(data: ExceptionsData): Promise<boolean> {
  cacheExceptions = null;

  // 1. If Supabase is configured, sync deductions
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const fixedRows = data.fixed.map(d => ({
        id: d.id || `fixed-${d.client}|${d.location}|${d.name}`,
        client: d.client,
        location: d.location,
        name: d.name,
        rule_type: 'fixed',
        amount: parseFloat(String(d.amount)) || 0,
        code_rule: null,
        updated_at: new Date().toISOString(),
      }));

      const codeRows = data.codeBased.map(c => {
        const code = (c.code || 'MOD').trim().toUpperCase();
        let serialized = 'ALL_PAY_MOD';
        if (c.rule === 'DEDUCT_EXCEPT_CODE') {
          serialized = code === 'MOD' ? 'ALL_PAY_MOD' : `EXCEPT:${code}`;
        } else {
          serialized = `DEDUCT:${code}`;
        }
        return {
          id: c.id || `code-${c.client}|${c.location}|${c.name}`,
          client: c.client,
          location: c.location,
          name: c.name,
          rule_type: 'code_based',
          amount: 0,
          code_rule: serialized,
          updated_at: new Date().toISOString(),
        };
      });

      const allDedRows = [...fixedRows, ...codeRows];
      if (allDedRows.length > 0) {
        await supabase.from('contractor_deductions').upsert(allDedRows, { onConflict: 'id' });
      }

      const onceRows = (data.onceOnly || []).map(o => ({
        id: o.id,
        client: o.client,
        location: o.location,
        name: o.name,
        type: o.type,
        amount: parseFloat(String(o.amount)) || 0,
        pay_period: o.payPeriod || null,
        note: o.note || null,
        updated_at: new Date().toISOString(),
      }));

      if (onceRows.length > 0) {
        await supabase.from('once_only_exceptions').upsert(onceRows, { onConflict: 'id' });
      }
    }
  }

  // 2. Persist locally
  const raw: RawDeductionsData = {};

  for (const d of data.fixed) {
    if (!raw[d.client]) raw[d.client] = {};
    if (!raw[d.client][d.location]) raw[d.client][d.location] = {};
    raw[d.client][d.location][d.name] = parseFloat(String(d.amount)) || 0;
  }

  for (const c of data.codeBased) {
    if (!raw[c.client]) raw[c.client] = {};
    if (!raw[c.client][c.location]) raw[c.client][c.location] = {};
    
    const code = (c.code || 'MOD').trim().toUpperCase();
    let serialized = 'ALL_PAY_MOD';
    if (c.rule === 'DEDUCT_EXCEPT_CODE') {
      serialized = code === 'MOD' ? 'ALL_PAY_MOD' : `EXCEPT:${code}`;
    } else {
      serialized = `DEDUCT:${code}`;
    }
    raw[c.client][c.location][c.name] = serialized;
  }

  await writeJsonFile('contractor_deductions.json', raw);
  await writeJsonFile('once_only_exceptions.json', data.onceOnly || []);
  return true;
}

export async function getDeductions(): Promise<Deduction[]> {
  const { fixed } = await getExceptionsData();
  return fixed;
}

export async function saveDeductions(deductions: Deduction[]): Promise<boolean> {
  const current = await getExceptionsData();
  return saveExceptionsData({ fixed: deductions, codeBased: current.codeBased, onceOnly: current.onceOnly });
}

export type ContractorDirectory = Record<string, Record<string, string[]>>;

export async function getContractorDirectory(): Promise<ContractorDirectory> {
  const rates = await getRates();
  const directory: ContractorDirectory = {};

  for (const r of rates) {
    if (!directory[r.client]) directory[r.client] = {};
    if (!directory[r.client][r.location]) directory[r.client][r.location] = [];
    
    const cleanName = r.name.replace(/\s*\([^)]*\)/g, '').trim();
    if (cleanName && !directory[r.client][r.location].includes(cleanName)) {
      directory[r.client][r.location].push(cleanName);
    }
  }

  for (const client in directory) {
    for (const location in directory[client]) {
      directory[client][location].sort();
    }
  }

  return directory;
}

export interface TrainingRecord {
  client?: string;
  location: string;
  name: string;
  norm_name?: string;
  role: string;
  training_dates?: string[];
  total_hours?: number;
  weeks_since_completion?: number;
  pay_released?: boolean;
  target_release_week?: string;
  status: 'Training' | 'Waiting' | 'Released' | 'PAID' | string;
}

// The raw JSON shape
type RawTrainingData = Record<string, Record<string, Record<string, any>>>;

import { deriveTraineeStatus, calculateReleaseWeek, REQUIRED_TRAINING_DAYS } from './trainingUtils';

export async function getTraining(): Promise<TrainingRecord[]> {
  // 0. Return from in-memory cache if fresh
  if (cacheTraining && Date.now() < cacheTraining.expires) {
    return cacheTraining.data;
  }

  // 1. If Supabase is configured, fetch live synced training records
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('training_records').select('*');
      if (!error && data && data.length > 0) {
        const records: TrainingRecord[] = data.map(t => {
          const training_dates = Array.isArray(t.training_dates) ? t.training_dates : [];
          let target_release_week = t.target_release_week || undefined;
          if (!target_release_week && training_dates.length >= REQUIRED_TRAINING_DAYS) {
            target_release_week = calculateReleaseWeek(training_dates);
          }
          const status = deriveTraineeStatus({
            pay_released: Boolean(t.pay_released),
            status: t.status,
            training_dates,
            target_release_week,
          });

          return {
            client: t.client,
            location: t.location,
            norm_name: t.norm_name,
            name: t.name,
            role: t.role || 'Trainee',
            training_dates,
            total_hours: Number(t.total_hours) || 0,
            weeks_since_completion: Number(t.weeks_since_completion) || 0,
            status,
            pay_released: status === 'PAID' || Boolean(t.pay_released),
            target_release_week,
          };
        });

        // Sort latest dates first
        records.sort((a, b) => {
          const getLatestDate = (r: TrainingRecord): number => {
            if (r.training_dates && r.training_dates.length > 0) {
              const sorted = [...r.training_dates].sort();
              const latest = sorted[sorted.length - 1];
              const tVal = new Date(latest).getTime();
              if (!isNaN(tVal)) return tVal;
            }
            if (r.target_release_week) {
              const tVal = new Date(r.target_release_week).getTime();
              if (!isNaN(tVal)) return tVal;
            }
            return 0;
          };
          return getLatestDate(b) - getLatestDate(a);
        });

        cacheTraining = { data: records, expires: Date.now() + CACHE_TTL_MS };
        return records;
      }
    }
  }

  // 2. Offline / Local fallback to training_tracker.json
  const raw = await readJsonFile<RawTrainingData>('training_tracker.json', {});
  const records: TrainingRecord[] = [];

  for (const client in raw) {
    for (const location in raw[client]) {
      for (const normName in raw[client][location]) {
        const t = raw[client][location][normName];
        const training_dates = t.training_dates || [];
        let target_release_week = t.target_release_week;
        if (!target_release_week && training_dates.length >= REQUIRED_TRAINING_DAYS) {
          target_release_week = calculateReleaseWeek(training_dates);
        }

        const status = deriveTraineeStatus({
          pay_released: Boolean(t.pay_released),
          status: t.status,
          training_dates,
          target_release_week,
        });

        records.push({
          client,
          location,
          norm_name: normName,
          name: t.display_name || normName,
          role: t.role || 'Trainee',
          training_dates,
          total_hours: t.total_hours || 0,
          weeks_since_completion: t.weeks_since_completion || 0,
          pay_released: status === 'PAID',
          target_release_week,
          status,
        });
      }
    }
  }

  // Sort with most recent training date (or release week) at the top
  records.sort((a, b) => {
    const getLatestDate = (r: TrainingRecord): number => {
      if (r.training_dates && r.training_dates.length > 0) {
        const sorted = [...r.training_dates].sort();
        const latest = sorted[sorted.length - 1];
        const t = new Date(latest).getTime();
        if (!isNaN(t)) return t;
      }
      if (r.target_release_week) {
        const t = new Date(r.target_release_week).getTime();
        if (!isNaN(t)) return t;
      }
      return 0;
    };

    return getLatestDate(b) - getLatestDate(a);
  });

  cacheTraining = { data: records, expires: Date.now() + CACHE_TTL_MS };
  return records;
}

export async function saveTraining(records: TrainingRecord[]): Promise<boolean> {
  cacheTraining = null;

  // 1. If Supabase is configured, sync to PostgreSQL
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const rows = records.map(r => {
        const c = r.client || "IHS";
        const loc = r.location;
        const norm = r.norm_name || r.name.toUpperCase().replace(/\s+/g, '');
        return {
          id: `${c}|${loc}|${norm}`,
          client: c,
          location: loc,
          norm_name: norm,
          name: r.name,
          role: r.role || 'Trainee',
          training_dates: r.training_dates || [],
          total_hours: r.total_hours || 0,
          weeks_since_completion: r.weeks_since_completion || 0,
          status: r.status,
          pay_released: r.status === 'PAID' || Boolean(r.pay_released),
          target_release_week: r.target_release_week || null,
          updated_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        await supabase.from('training_records').upsert(batch, { onConflict: 'id' });
      }
    }
  }

  // 2. Persist locally
  const raw = await readJsonFile<RawTrainingData>('training_tracker.json', {});
  
  for (const r of records) {
    const c = r.client || "IHS";
    const loc = r.location;
    const n = r.norm_name || r.name.toUpperCase().replace(/\s+/g, '');

    if (!raw[c]) raw[c] = {};
    if (!raw[c][loc]) raw[c][loc] = {};

    if (raw[c][loc][n]) {
       raw[c][loc][n].status = r.status;
       raw[c][loc][n].pay_released = (r.status === 'PAID');
       raw[c][loc][n].total_hours = r.total_hours;
       if (r.training_dates) {
          raw[c][loc][n].training_dates = r.training_dates;
       }
       if (r.target_release_week) {
          raw[c][loc][n].target_release_week = r.target_release_week;
       }
       
       if (r.status === 'Released') {
          const lastDate = r.training_dates && r.training_dates.length > 0 ? new Date(r.training_dates[r.training_dates.length - 1]) : new Date();
          if (!raw[c][loc][n].target_release_week) {
            raw[c][loc][n].target_release_week = lastDate.toISOString().split('T')[0];
          }
       } else if (r.status === 'Training') {
          delete raw[c][loc][n].target_release_week;
       }
    } else {
       raw[c][loc][n] = {
          display_name: r.name,
          role: r.role || 'Trainee',
          training_dates: r.training_dates || [],
          total_hours: r.total_hours || 0,
          weeks_since_completion: r.weeks_since_completion || 0,
          status: r.status || 'Training',
          pay_released: r.status === 'PAID',
          target_release_week: r.target_release_week
       };
    }
  }

  await writeJsonFile('training_tracker.json', raw);
  return true;
}

export async function getCompletedPayPeriods(): Promise<string[]> {
  if (cacheCompletedPeriods && Date.now() < cacheCompletedPeriods.expires) {
    return cacheCompletedPeriods.data;
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.from('completed_pay_periods').select('period_key').eq('completed', true);
      if (data) {
        const res = data.map(d => d.period_key);
        cacheCompletedPeriods = { data: res, expires: Date.now() + CACHE_TTL_MS };
        return res;
      }
    }
  }

  const res = await readJsonFile<string[]>('completed_pay_periods.json', []);
  cacheCompletedPeriods = { data: res, expires: Date.now() + CACHE_TTL_MS };
  return res;
}

export async function setPayPeriodCompleted(periodKey: string, completed: boolean): Promise<string[]> {
  cacheCompletedPeriods = null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('completed_pay_periods').upsert({
        period_key: periodKey,
        completed,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'period_key' });
    }
  }

  const current = await readJsonFile<string[]>('completed_pay_periods.json', []);
  let updated: string[];
  if (completed) {
    updated = current.includes(periodKey) ? current : [...current, periodKey];
  } else {
    updated = current.filter(k => k !== periodKey);
  }
  await writeJsonFile('completed_pay_periods.json', updated);
  return updated;
}

export interface InvoiceRateItem {
  client: string;
  location: string;
  weekdays: number;
  weekend: number;
}

export type RawInvoiceRates = Record<string, Record<string, { weekdays: number; weekend: number }>>;

export async function getInvoiceRates(): Promise<InvoiceRateItem[]> {
  if (cacheInvoiceRates && Date.now() < cacheInvoiceRates.expires) {
    return cacheInvoiceRates.data;
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('invoice_rates').select('*');
      if (!error && data && data.length > 0) {
        const items = data.map(r => ({
          client: r.client,
          location: r.location,
          weekdays: Number(r.weekdays) || 0,
          weekend: Number(r.weekend) || 0,
        }));
        cacheInvoiceRates = { data: items, expires: Date.now() + CACHE_TTL_MS };
        return items;
      }
    }
  }

  const raw = await readJsonFile<RawInvoiceRates>('invoice_rates.json', {
    'ZB Solution': {
      'Ozone': { weekdays: 30.0, weekend: 32.0 },
      'Beyond': { weekdays: 32.0, weekend: 34.0 }
    }
  });
  const items: InvoiceRateItem[] = [];
  for (const client in raw) {
    for (const location in raw[client]) {
      const isBeyond = location.toLowerCase() === 'beyond';
      items.push({
        client,
        location,
        weekdays: raw[client][location]?.weekdays ?? (isBeyond ? 32.0 : 30.0),
        weekend: raw[client][location]?.weekend ?? (isBeyond ? 34.0 : 32.0)
      });
    }
  }
  cacheInvoiceRates = { data: items, expires: Date.now() + CACHE_TTL_MS };
  return items;
}

export async function saveInvoiceRate(client: string, location: string, weekdays: number, weekend: number): Promise<boolean> {
  cacheInvoiceRates = null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('invoice_rates').upsert({
        id: `${client}|${location}`,
        client,
        location,
        weekdays,
        weekend,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }
  }

  const raw = await readJsonFile<RawInvoiceRates>('invoice_rates.json', {});
  if (!raw[client]) raw[client] = {};
  raw[client][location] = { weekdays, weekend };
  await writeJsonFile('invoice_rates.json', raw);
  return true;
}
