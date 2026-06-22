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
   - `SUPABASE_SERVICE_ROLE_KEY` for permanent file uploads through the server API
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

## Permanent File Storage

Run `supabase/schema.sql`, then add `SUPABASE_SERVICE_ROLE_KEY` to Vercel. The dashboard uses `/api/files` to create short-lived Supabase Storage links, so uploads, previews, downloads, and deletes work without showing a login panel. It also uses `/api/state` to save the dashboard state as `personal/dashboard-state.json` in the same storage bucket, so file cards, notes, tasks, calendar items, and habits can persist without the removed sign-in panel. Optionally add `DASHBOARD_ACCESS_KEY` on Vercel if you want these APIs to ask for a private access key before allowing actions.

## Same Data On Laptop And Phone

For the same dashboard data everywhere, Vercel must have:

```env
NEXT_PUBLIC_SITE_URL=https://your-dashboard.vercel.app
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DASHBOARD_ACCESS_KEY=your_dashboard_password
```

After deploying those env vars, open the dashboard once on the laptop browser that already has your local data and enter the password. If the cloud copy is empty or older, the laptop data is uploaded automatically. Then open the same Vercel URL on your phone and enter the same password; it will download the shared cloud data.

Dashboard data is kept until you remove it. Notes, tasks, calendar items, stock picks, growth habits, albums, and files all have remove controls; cloud files and synced stock-pick rows are deleted from Supabase too.

## Smart Calendar Reminders

Calendar items include push reminders through OneSignal, Supabase, and Vercel Cron.

1. Run `supabase/schema.sql` or `supabase/migrations/20250121_add_notifications_to_events.sql` in Supabase.
2. Create a OneSignal Web Push app for your production dashboard origin.
3. Add the public browser env vars:
   - `VITE_ONESIGNAL_APP_ID`
   - `VITE_ONESIGNAL_EXTERNAL_ID=hk-dashboard` for shared password-only dashboards, or any stable id you want every device to use
   - `VITE_REMINDER_TIME_ZONE=Asia/Kolkata`
4. Add the server-only Vercel env vars:
   - `ONESIGNAL_APP_ID`
   - `ONESIGNAL_REST_API_KEY`
   - `ONESIGNAL_EXTERNAL_ID=hk-dashboard`
   - `REMINDER_TIME_ZONE=Asia/Kolkata`
   - `CRON_SECRET`

Vercel calls `/api/reminders` once a day (Hobby-plan safe). The endpoint checks upcoming events, claims each reminder in `notification_log`, sends OneSignal push notifications once, moves completed events into Completed History, and opens `/calendar` when a notification is clicked.

> **Heads-up on cadence.** Vercel's free Hobby plan caps cron at once per day, so the in-platform cron alone is too coarse for the 2-day / 1-day / 3-hour / start-time reminder windows. For reliable near-real-time reminders, point an **external free scheduler** at the same endpoint. This keeps the project on the free tier while still firing reminders on time.

### Free external scheduler (recommended on Hobby)

[cron-job.org](https://cron-job.org) is free and pings an arbitrary URL on any schedule. Set it up as the primary 15-minute driver:

1. Create a free account at [cron-job.org](https://cron-job.org).
2. **Create Cronjob** with these values:
   - **Title:** `HK Dashboard reminders`
   - **URL:** `https://hk-dashboard-omega.vercel.app/api/reminders`
   - **Execution schedule:** Every 15 minutes (`*/15 * * * *`)
   - **Request method:** `GET`
   - **Headers:** add a custom header
     - **Key:** `Authorization`
     - **Value:** `Bearer <CRON_SECRET>` (same value as the `CRON_SECRET` env var in Vercel)
3. Save and enable. cron-job.org will hit your endpoint every 15 minutes; `/api/reminders` authenticates the `Bearer` token exactly the same way it authenticates Vercel's own cron.

Other free alternatives that work the same way: [EasyCron](https://www.easycron.com), [SetCronJob](https://www.setcronjob.com), or a single GitHub Actions workflow. Point any of them at `/api/reminders` with the `Authorization: Bearer <CRON_SECRET>` header.

### Test the cron manually

```powershell
curl "https://hk-dashboard-omega.vercel.app/api/reminders" -H "Authorization: Bearer YOUR_CRON_SECRET"
```

A healthy response looks like `{"ok":true,"checked":N,"sent":N,"completed":N,"changed":...}`. If you see `401 Unauthorized`, the `CRON_SECRET` header value does not match the env var.

## Gallery Albums

Gallery & Files supports albums/folders. Uploads are saved into the selected album. Locked albums use a separate album password, so private folders can be opened only after unlocking them.

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

## HK AI Assistant

The dashboard includes **HK AI**, a built-in action assistant for notes, tasks, and calendar events.

1. Add one or more provider keys to Vercel (server-side only):
   - `GEMINI_API_KEY` — Google Gemini
   - `OPENROUTER_API_KEY` — OpenRouter
   - `GROQ_API_KEY` — Groq
2. Optional: `AI_PROVIDER=auto` and `AI_PROVIDER_ORDER=gemini,openrouter,groq`
3. Redeploy, then click the **AI** button in the bottom-right corner of the dashboard.

If the first provider fails, HK AI automatically tries the next one in order.

**No dashboard hourly limit.** Simple commands (add task, add habit, check boxes, list items) run in **offline unlimited mode** without using API credits. Free API limits (Groq/Gemini/OpenRouter) only apply to complex chat questions.

Examples:

- `Add a note: milk, bread, eggs`
- `Tomorrow finish Physics homework`
- `English UT on 7 July at 9 AM`
- `Mark Physics homework done`

HK AI returns structured actions and updates your dashboard automatically.

**Chat privacy:** AI conversations are temporary (session only). They are not saved to Supabase. Only notes, tasks, events, habits, picks, albums, and files that HK AI creates or removes are persisted through normal dashboard sync.

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
