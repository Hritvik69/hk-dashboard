# HK Dashboard
https://hk-dashboard-omega.vercel.app/ --->>> Jump into hk's dashboard 
Personal dashboard for notes, todo, reminders, gallery, 30-day growth tracking, tomorrow stock picks, and quick links.

It is built to work in two modes:

- **Vercel:** public web dashboard with optional Supabase login and cloud saving.
- **Tailscale:** private dashboard running on your laptop, reachable from your own devices.

## Run Locally

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Deploy On Vercel

1. Import this GitHub repo into Vercel.
2. Keep the default build command: `npm run build`.
3. Keep the default output directory: `dist`.
4. Add Supabase environment variables if you want login and cloud sync:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SITE_URL` with your live Vercel dashboard URL
   - Or use Supabase/Vercel style names:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     - `NEXT_PUBLIC_SITE_URL`

Without Supabase, the dashboard still works, but saves only in the current browser.

## Supabase Cloud Saving

Create a Supabase project, then run the SQL in `supabase/schema.sql`.

After that, add these environment variables in Vercel and in your local `.env`:

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SITE_URL=https://your-dashboard.vercel.app
```

These names also work:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_SITE_URL=https://your-dashboard.vercel.app
```

The app uses Supabase Auth magic links. Once signed in, your dashboard data is saved per user.
Set `NEXT_PUBLIC_SITE_URL` or `VITE_SITE_URL` on Vercel to keep login links pointed at the live dashboard instead of a local preview URL.

## Connect Odysseus

Your live dashboard cannot directly read `127.0.0.1:7000`, because that only exists on your laptop. Use the local sync command instead.

Create `.env.local` on your laptop:

```env
ODYSSEUS_URL=http://127.0.0.1:7000
ODYSSEUS_API_TOKEN=your_odysseus_codex_token
NEXT_PUBLIC_SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_USER_EMAIL=the_email_you_use_to_login_to_dashboard
```

Then run:

```powershell
npm run sync:odysseus
```

This reads Odysseus through `/api/codex/dashboard/export` and writes the data into your Supabase `dashboard_state` row. Keep the service role key private; do not add it to Vercel frontend environment variables.

## Tailscale Access

Run locally:

```powershell
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Then expose it privately with Tailscale:

```powershell
tailscale serve --bg http://127.0.0.1:4173
```

This keeps it private to your Tailscale account. For personal use, this is the safest setup.

## Tomorrow's Picks

Tomorrow's Picks can arrive two ways.

Preferred: add these secrets to your Streamlit app so the scanner publishes picks into Supabase after every scan:

```toml
SUPABASE_URL = "your_project_url"
SUPABASE_SERVICE_ROLE_KEY = "your_service_role_key"
```

The live dashboard reads those picks from the `tomorrow_picks` table automatically.

Fallback: if your NSE scanner exposes a JSON endpoint, set:

```env
VITE_STOCK_PICKS_URL=https://your-scanner-url/picks.json
```

The endpoint can return:

```json
[
  {
    "symbol": "RELIANCE",
    "name": "Reliance Industries",
    "source": "AI",
    "bias": "Bullish",
    "entry": "2860",
    "target": "2920",
    "stop": "2810",
    "confidence": 82
  }
]
```

Manual picks can also be added directly in the dashboard.

## Backup

Use the export button in the dashboard to download all data as JSON. This is useful even when Supabase sync is enabled.
