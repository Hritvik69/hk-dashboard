import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'dashboard-files';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

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

function errorStatus(error) {
  return Number(error?.statusCode || error?.status || 500);
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 96);
}

function safeId(value) {
  const text = String(value || '').trim();
  if (/^[a-z0-9_-]{6,120}$/i.test(text)) return text;
  return `file-${crypto.randomUUID()}`;
}

function safeBucket(value) {
  const bucket = String(value || DEFAULT_BUCKET).trim();
  if (!/^[a-z0-9._-]{3,80}$/i.test(bucket)) {
    throw createHttpError('Invalid storage bucket.', 400);
  }
  return bucket;
}

function safePath(value) {
  const path = String(value || '').trim();
  if (!path || path.length > 512 || path.includes('\0') || path.includes('..')) {
    throw createHttpError('Invalid storage path.', 400);
  }
  return path;
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
    throw createHttpError('Supabase file storage is not configured on Vercel.', 500);
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

async function createUploadUrl(admin, body) {
  const bucket = safeBucket(body.bucket);
  const id = safeId(body.id);
  const name = safeFileName(body.name);
  const size = Number(body.size || 0);
  if (size < 0 || size > MAX_FILE_SIZE) {
    throw createHttpError('File is too large for dashboard storage.', 413);
  }

  const path = `personal/${id}-${name}`;
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw createHttpError(error.message || 'Could not create upload URL.', 500);

  return {
    id,
    bucket,
    path,
    signedUrl: data?.signedUrl || '',
    token: data?.token || '',
  };
}

async function createReadUrl(admin, body) {
  const bucket = safeBucket(body.bucket);
  const path = safePath(body.path);
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (error) throw createHttpError(error.message || 'Could not open file.', 500);
  return { bucket, path, signedUrl: data?.signedUrl || '' };
}

async function deleteFile(admin, body) {
  const bucket = safeBucket(body.bucket);
  const path = safePath(body.path);
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await admin.storage.from(bucket).remove([path]);
    if (!error) {
      console.log(`[files] deleted ${bucket}/${path} on attempt ${attempt}`);
      return { bucket, path, deleted: true, attempt };
    }
    lastError = error;
    console.warn(`[files] delete attempt ${attempt} failed for ${bucket}/${path}: ${error.message}`);
    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw createHttpError(lastError?.message || 'Could not delete file.', 500);
}

async function purgeOrphanFiles(admin, body) {
  const bucket = safeBucket(body.bucket);
  const folder = String(body.folder || 'personal').replace(/[^a-z0-9._/-]/gi, '').slice(0, 80) || 'personal';
  const keepPaths = new Set(
    (Array.isArray(body.keepPaths) ? body.keepPaths : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  const listed = await admin.storage.from(bucket).list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (listed.error) throw createHttpError(listed.error.message || 'Could not list files.', 500);

  const orphans = (listed.data || [])
    .filter((entry) => entry && entry.name && !keepPaths.has(`${folder}/${entry.name}`))
    .map((entry) => `${folder}/${entry.name}`)
    .filter((fullPath) => /^[a-z0-9._/-]{1,512}$/i.test(fullPath));

  if (!orphans.length) {
    return { bucket, folder, scanned: (listed.data || []).length, removed: 0 };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await admin.storage.from(bucket).remove(orphans);
    if (!error) {
      console.log(`[files] purged ${orphans.length} orphan(s) from ${bucket}/${folder} on attempt ${attempt}`);
      return { bucket, folder, scanned: (listed.data || []).length, removed: orphans.length, attempt };
    }
    lastError = error;
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw createHttpError(lastError?.message || 'Could not purge orphan files.', 500);
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

    if (action === 'upload-url') {
      json(res, 200, await createUploadUrl(admin, body));
      return;
    }

    if (action === 'read-url') {
      json(res, 200, await createReadUrl(admin, body));
      return;
    }

    if (action === 'delete') {
      json(res, 200, await deleteFile(admin, body));
      return;
    }

    if (action === 'purge-orphans') {
      json(res, 200, await purgeOrphanFiles(admin, body));
      return;
    }

    json(res, 400, { error: 'Unknown file action.' });
  } catch (error) {
    json(res, errorStatus(error), { error: error.message || 'File API failed.' });
  }
}
