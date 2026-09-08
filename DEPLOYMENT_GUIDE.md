# Production Deployment Guide: Vercel + Supabase

This guide walks you through deploying the **Payslip & Invoicing Web App** live to **Vercel** with a fully synchronized **Supabase PostgreSQL** backend.

---

## Step 1: Create Your Free Supabase Database (5 minutes)

1. Go to [supabase.com](https://supabase.com) and click **Start your project** (or sign in with GitHub).
2. Click **New Project**:
   - **Name**: `payslip-rigg` (or any name)
   - **Database Password**: Choose a strong password and save it
   - **Region**: Choose the region closest to Australia / your users (e.g. `Sydney (ap-southeast-2)`)
   - Click **Create new project**.
3. Once created, go to the left sidebar and click **SQL Editor**:
   - Click **New Query**.
   - Copy the entire contents of [`supabase_schema.sql`](./supabase_schema.sql) and paste it into the editor.
   - Click **Run** (green button).
   - This creates all 6 tables (`contractor_rates`, `invoice_rates`, `training_records`, `contractor_deductions`, `once_only_exceptions`, `completed_pay_periods`) with proper indexes and RLS policies.
4. Get your API credentials:
   - Go to **Project Settings** (gear icon at bottom left) &rarr; **API**.
   - Copy the **Project URL** (e.g. `https://xyzcompany.supabase.co`).
   - Copy the **anon public key** (`eyJhb...`).
   - Copy the **service_role secret key** (`eyJhb...`).

---

## Step 2: Seed Your Existing Data into Supabase (1 minute)

To migrate all current rates, training tracker history, and deduction rules into your live database, open PowerShell in this directory and run:

```powershell
# Set your Supabase credentials in your terminal session:
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# Run the migration script:
node scripts/seed_supabase.mjs
```

You will see output confirming:
- ✅ Contractor rates migrated
- ✅ Client invoice billing rates migrated
- ✅ Trainee history & completion statuses migrated
- ✅ Deductions & exceptions migrated

---

## Step 3: Deploy to Vercel (2 minutes)

### Option A: Via GitHub (Recommended for Continuous Updates)
1. Push this codebase to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial payslip rigg web app"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) and sign in.
3. Click **Add New...** &rarr; **Project** &rarr; Import your GitHub repository.
4. In the **Configure Project** screen:
   - If your Next.js app is in a subfolder (`payslip-web`), set the **Root Directory** to `payslip-web`.
5. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project-id.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `your-anon-key`
   - `SUPABASE_SERVICE_ROLE_KEY`: `your-service-role-key`
6. Click **Deploy**.

---

### Option B: Via Vercel CLI (Instant from your terminal)
You can deploy directly without GitHub using the Vercel CLI:

```bash
# In the payslip-web directory:
npx vercel
```
Follow the interactive prompts to log in, link your project, add the environment variables, and deploy to production!

---

## Step 4: Verification & Live Usage

Once deployed, visit your live Vercel URL (e.g. `https://payslip-rigg.vercel.app`):
* Any changes made to contractor rates or training tracking will automatically sync to your Supabase PostgreSQL database in real time.
* Multiple team members can access the tool simultaneously without data conflicts.
* Automatic HTTPS and global CDN caching ensure fast performance worldwide.
