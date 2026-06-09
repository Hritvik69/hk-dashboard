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

const config = {
  SUPABASE_URL: read('VITE_SUPABASE_URL') || read('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY:
    read('VITE_SUPABASE_ANON_KEY') ||
    read('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    read('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  STOCK_PICKS_URL: read('VITE_STOCK_PICKS_URL') || read('NEXT_PUBLIC_STOCK_PICKS_URL')
};

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
  path.join(publicDir, 'env.js'),
  `window.HK_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);
