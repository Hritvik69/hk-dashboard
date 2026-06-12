import { createClient } from '@supabase/supabase-js';

const STATE_BUCKET = 'dashboard-files';
const STATE_PATH = 'personal/dashboard-state.json';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function errorStatus(error) {
  return Number(error?.statusCode || error?.status || 500);
}

function supabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw createHttpError('Supabase dashboard state storage is not configured on Vercel.', 500);
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertAccess(req) {
  const expected = String(process.env.DASHBOARD_ACCESS_KEY || '').trim();
  if (!expected) return;

  const actual = String(req.headers['x-dashboard-access-key'] || '').trim();
  if (actual !== expected) {
    throw createHttpError('Dashboard access key required.', 401);
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function readState(admin) {
  const { data, error } = await admin.storage.from(STATE_BUCKET).download(STATE_PATH);
  if (error) {
    const status = Number(error.statusCode || error.status || 0);
    if (status === 404 || /not found/i.test(error.message || '')) {
      return { data: null, updatedAt: '' };
    }
    throw createHttpError(error.message || 'Could not load dashboard state.', 500);
  }

  const text = typeof data?.text === 'function' ? await data.text() : String(data || '{}');
  const payload = JSON.parse(text || '{}');
  return {
    data: payload.data && typeof payload.data === 'object' ? payload.data : null,
    updatedAt: String(payload.updatedAt || ''),
  };
}

async function writeState(admin, body) {
  const payload = {
    data: body.data && typeof body.data === 'object' ? body.data : {},
    updatedAt: new Date().toISOString(),
  };
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const { error } = await admin.storage.from(STATE_BUCKET).upload(STATE_PATH, buffer, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
  if (error) throw createHttpError(error.message || 'Could not save dashboard state.', 500);
  return payload;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    assertAccess(req);
    const admin = supabaseAdmin();

    if (req.method === 'GET') {
      json(res, 200, await readState(admin));
      return;
    }

    if (req.method === 'POST') {
      json(res, 200, await writeState(admin, await readJson(req)));
      return;
    }

    json(res, 405, { error: 'Use GET or POST.' });
  } catch (error) {
    json(res, errorStatus(error), { error: error.message || 'State API failed.' });
  }
}
