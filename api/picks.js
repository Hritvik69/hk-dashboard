import { createClient } from '@supabase/supabase-js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-access-key');
}

function json(res, status, payload) {
  res.statusCode = status;
  setCors(res);
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
    throw createHttpError('Supabase picks storage is not configured on Vercel.', 500);
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

async function deletePick(admin, body) {
  const id = String(body.id || '').trim();
  const symbol = String(body.symbol || '').trim().toUpperCase();
  const source = String(body.source || '').trim();
  if (!id && !symbol) throw createHttpError('Pick id or symbol required.', 400);

  let query = admin.from('tomorrow_picks').delete();
  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('symbol', symbol);
    if (source) query = query.eq('source', source);
  }

  const { error } = await query;
  if (error) throw createHttpError(error.message || 'Could not delete stock pick.', 500);
  return { deleted: true, id, symbol, source };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Use POST.' });
    return;
  }

  try {
    assertAccess(req);
    const body = await readJson(req);
    const action = String(req.query?.action || body.action || '').trim();
    const admin = supabaseAdmin();

    if (action === 'delete') {
      json(res, 200, await deletePick(admin, body));
      return;
    }

    json(res, 400, { error: 'Unknown picks action.' });
  } catch (error) {
    json(res, errorStatus(error), { error: error.message || 'Picks API failed.' });
  }
}
