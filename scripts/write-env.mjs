import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const envPath = path.join(root, '.env');

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;
      const equals = trimmed.indexOf('=');
      if (equals === -1) return env;
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      env[key] = value;
      return env;
    }, {});
}

const fileEnv = parseDotEnv(envPath);
const read = (key) => process.env[key] || fileEnv[key] || '';

function normalizePublicUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const config = {
  SUPABASE_URL: read('VITE_SUPABASE_URL') || read('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY:
    read('VITE_SUPABASE_ANON_KEY') ||
    read('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    read('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  ONESIGNAL_APP_ID: read('VITE_ONESIGNAL_APP_ID') || read('NEXT_PUBLIC_ONESIGNAL_APP_ID'),
  ONESIGNAL_EXTERNAL_ID:
    read('VITE_ONESIGNAL_EXTERNAL_ID') ||
    read('NEXT_PUBLIC_ONESIGNAL_EXTERNAL_ID') ||
    read('ONESIGNAL_EXTERNAL_ID') ||
    'hk-dashboard',
  REMINDER_TIME_ZONE:
    read('VITE_REMINDER_TIME_ZONE') ||
    read('NEXT_PUBLIC_REMINDER_TIME_ZONE') ||
    read('REMINDER_TIME_ZONE') ||
    'Asia/Kolkata',
  STOCK_PICKS_URL: read('VITE_STOCK_PICKS_URL') || read('NEXT_PUBLIC_STOCK_PICKS_URL'),
  SITE_URL: normalizePublicUrl(
    read('VITE_SITE_URL') ||
      read('NEXT_PUBLIC_SITE_URL') ||
      read('SITE_URL') ||
      read('VERCEL_PROJECT_PRODUCTION_URL') ||
      read('VERCEL_URL')
  ),
  // Only include DASHBOARD_ACCESS_KEY if it's actually set (empty string = skip landing page)
  ...(read('VITE_DASHBOARD_ACCESS_KEY') || read('DASHBOARD_ACCESS_KEY')
    ? { DASHBOARD_ACCESS_KEY: read('VITE_DASHBOARD_ACCESS_KEY') || read('DASHBOARD_ACCESS_KEY') }
    : {}),
};

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
  path.join(publicDir, 'env.js'),
  `window.HK_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);
