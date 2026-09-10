import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// Auto-load .env.local or .env if present
async function loadDotEnv() {
  const envFiles = [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../.env')
  ];
  for (const file of envFiles) {
    try {
      const text = await fs.readFile(file, 'utf-8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    } catch {}
  }
}

await loadDotEnv();

// Read environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ ERROR: Supabase credentials missing.');
  console.error('Please either:');
  console.error('  1. Put your keys into payslip-web/.env.local (see .env.example)');
  console.error('  2. Or pass them via PowerShell:');
  console.error('     $env:NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"');
  console.error('     $env:SUPABASE_SERVICE_ROLE_KEY="xxx"');
  console.error('     node scripts/seed_supabase.mjs\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function readJson(filename) {
  try {
    const p = path.join(ROOT_DIR, filename);
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[WARN] Could not read ${filename}: ${err.message}`);
    return null;
  }
}

async function seed() {
  console.log('🚀 Starting Supabase Database Migration & Seeding...\n');

  // 1. Seed Contractor Rates
  console.log('1️⃣ Migrating Contractor Rates...');
  const ratesJson = await readJson('contractor_rates.json');
  if (ratesJson) {
    const rows = [];
    for (const client of Object.keys(ratesJson)) {
      for (const location of Object.keys(ratesJson[client])) {
        for (const name of Object.keys(ratesJson[client][location])) {
          for (const dayType of Object.keys(ratesJson[client][location][name])) {
            const rate = parseFloat(ratesJson[client][location][name][dayType]) || 0;
            rows.push({
              id: `${client}|${location}|${name}|${dayType}`,
              client,
              location,
              name,
              day_type: dayType,
              rate,
              updated_at: new Date().toISOString()
            });
          }
        }
      }
    }

    console.log(`   Found ${rows.length} rate records. Uploading in batches...`);
    for (let i = 0; i < rows.length; i += 400) {
      const batch = rows.slice(i, i + 400);
      const { error } = await supabase.from('contractor_rates').upsert(batch, { onConflict: 'id' });
      if (error) console.error('   ❌ Batch error:', error.message);
    }
    console.log('   ✅ Contractor rates migrated successfully.\n');
  }

  // 2. Seed Invoice Rates
  console.log('2️⃣ Migrating Invoice Billing Rates...');
  const invoiceJson = await readJson('invoice_rates.json');
  if (invoiceJson) {
    const rows = [];
    for (const client of Object.keys(invoiceJson)) {
      for (const location of Object.keys(invoiceJson[client])) {
        rows.push({
          id: `${client}|${location}`,
          client,
          location,
          weekdays: invoiceJson[client][location]?.weekdays ?? 30.0,
          weekend: invoiceJson[client][location]?.weekend ?? 32.0,
          updated_at: new Date().toISOString()
        });
      }
    }
    const { error } = await supabase.from('invoice_rates').upsert(rows, { onConflict: 'id' });
    if (error) console.error('   ❌ Error:', error.message);
    else console.log(`   ✅ Migrated ${rows.length} invoice rate configurations.\n`);
  }

  // 3. Seed Training Tracker
  console.log('3️⃣ Migrating Training Tracker...');
  const trainingJson = await readJson('training_tracker.json');
  if (trainingJson) {
    const rows = [];
    for (const client of Object.keys(trainingJson)) {
      for (const location of Object.keys(trainingJson[client])) {
        for (const normName of Object.keys(trainingJson[client][location])) {
          const t = trainingJson[client][location][normName];
          rows.push({
            id: `${client}|${location}|${normName}`,
            client,
            location,
            norm_name: normName,
            name: t.display_name || normName,
            role: t.role || 'Trainee',
            training_dates: t.training_dates || [],
            total_hours: t.total_hours || 0,
            weeks_since_completion: t.weeks_since_completion || 0,
            status: t.status || (t.pay_released ? 'PAID' : 'Training'),
            pay_released: Boolean(t.pay_released),
            target_release_week: t.target_release_week || null,
            updated_at: new Date().toISOString()
          });
        }
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.from('training_records').upsert(batch, { onConflict: 'id' });
      if (error) console.error('   ❌ Batch error:', error.message);
    }
    console.log(`   ✅ Migrated ${rows.length} trainee records.\n`);
  }

  // 4. Seed Deductions & Code Exceptions
  console.log('4️⃣ Migrating Deductions & Exceptions...');
  const dedJson = await readJson('contractor_deductions.json');
  if (dedJson) {
    const rows = [];
    for (const client of Object.keys(dedJson)) {
      for (const location of Object.keys(dedJson[client])) {
        for (const name of Object.keys(dedJson[client][location])) {
          const val = dedJson[client][location][name];
          if (typeof val === 'number') {
            rows.push({
              id: `fixed-${client}|${location}|${name}`,
              client,
              location,
              name,
              rule_type: 'fixed',
              amount: val,
              code_rule: null,
              updated_at: new Date().toISOString()
            });
          } else {
            rows.push({
              id: `code-${client}|${location}|${name}`,
              client,
              location,
              name,
              rule_type: 'code_based',
              amount: 0,
              code_rule: String(val),
              updated_at: new Date().toISOString()
            });
          }
        }
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase.from('contractor_deductions').upsert(rows, { onConflict: 'id' });
      if (error) console.error('   ❌ Error:', error.message);
      else console.log(`   ✅ Migrated ${rows.length} deduction rules.\n`);
    }
  }

  // 5. Seed Once-Only Exceptions
  console.log('5️⃣ Migrating Once-Only Exceptions...');
  const onceOnlyJson = await readJson('once_only_exceptions.json');
  if (Array.isArray(onceOnlyJson) && onceOnlyJson.length > 0) {
    const rows = onceOnlyJson.map(o => ({
      id: o.id || `once-${Date.now()}-${Math.random()}`,
      client: o.client,
      location: o.location,
      name: o.name,
      type: o.type,
      amount: parseFloat(o.amount) || 0,
      pay_period: o.payPeriod || null,
      note: o.note || '',
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('once_only_exceptions').upsert(rows, { onConflict: 'id' });
    if (error) console.error('   ❌ Error:', error.message);
    else console.log(`   ✅ Migrated ${rows.length} once-only exceptions.\n`);
  }

  // 6. Seed Completed Pay Periods
  console.log('6️⃣ Migrating Completed Pay Periods...');
  const periods = await readJson('completed_pay_periods.json');
  if (Array.isArray(periods) && periods.length > 0) {
    const rows = periods.map(p => ({
      period_key: p,
      completed: true,
      completed_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('completed_pay_periods').upsert(rows, { onConflict: 'period_key' });
    if (error) console.error('   ❌ Error:', error.message);
    else console.log(`   ✅ Migrated ${rows.length} pay periods.\n`);
  }

  console.log('🎉 Supabase database seeding complete! All data is synced and ready for live production.');
}

seed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
