-- ==========================================================
-- Payslip & Invoicing System - Supabase PostgreSQL Schema
-- Run this script in the Supabase SQL Editor (supabase.com -> SQL Editor)
-- ==========================================================

-- 1. Contractor Rates Table (Internal Staff Rates)
CREATE TABLE IF NOT EXISTS public.contractor_rates (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    location TEXT NOT NULL,
    name TEXT NOT NULL,
    day_type TEXT NOT NULL,
    rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractor_rates_lookup 
ON public.contractor_rates(client, location, name);

-- 2. Client Invoice Billing Rates Table (ZB Solution / Hotel Billing)
CREATE TABLE IF NOT EXISTS public.invoice_rates (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    location TEXT NOT NULL,
    weekdays NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
    weekend NUMERIC(10, 2) NOT NULL DEFAULT 32.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Training Tracker Records Table
CREATE TABLE IF NOT EXISTS public.training_records (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL DEFAULT 'IHS',
    location TEXT NOT NULL,
    norm_name TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Trainee',
    training_dates JSONB NOT NULL DEFAULT '[]'::JSONB,
    total_hours NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    weeks_since_completion INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Training',
    pay_released BOOLEAN NOT NULL DEFAULT FALSE,
    target_release_week TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_records_lookup 
ON public.training_records(client, location, norm_name);

-- 4. Contractor Deductions & Code Exceptions Table
CREATE TABLE IF NOT EXISTS public.contractor_deductions (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    location TEXT NOT NULL,
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL, -- 'fixed' or 'code_based'
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    code_rule TEXT,          -- e.g. 'ALL_PAY_MOD', 'EXCEPT:MOD', 'DEDUCT:MOD'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Once-Only Pay Period Exceptions Table
CREATE TABLE IF NOT EXISTS public.once_only_exceptions (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    location TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,       -- e.g. 'Short fall pay', 'Exceed'
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    pay_period TEXT,
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Completed Pay Periods Table (Calendar Tracking)
CREATE TABLE IF NOT EXISTS public.completed_pay_periods (
    period_key TEXT PRIMARY KEY,
    completed BOOLEAN NOT NULL DEFAULT TRUE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- By default, allow access via Anon and Service Role Keys
-- ==========================================================
ALTER TABLE public.contractor_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.once_only_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completed_pay_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to contractor_rates" ON public.contractor_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to invoice_rates" ON public.invoice_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to training_records" ON public.training_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to contractor_deductions" ON public.contractor_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to once_only_exceptions" ON public.once_only_exceptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to completed_pay_periods" ON public.completed_pay_periods FOR ALL USING (true) WITH CHECK (true);
