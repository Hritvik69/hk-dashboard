import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

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

const fileEnv = {
  ...parseDotEnv(path.join(root, '.env')),
  ...parseDotEnv(path.join(root, '.env.local'))
};

const read = (...keys) => {
  for (const key of keys) {
    const value = process.env[key] || fileEnv[key];
    if (value) return value;
  }
  return '';
};

const config = {
  odysseusUrl: read('ODYSSEUS_URL').replace(/\/+$/, ''),
  odysseusToken: read('ODYSSEUS_API_TOKEN'),
  supabaseUrl: read('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, ''),
  serviceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  userEmail: read('SUPABASE_USER_EMAIL'),
  userId: read('SUPABASE_USER_ID')
};

function requireConfig() {
  const missing = Object.entries(config)
    .filter(([key, value]) => !value && !['userEmail', 'userId'].includes(key))
    .map(([key]) => key);
  if (!config.userEmail && !config.userId) missing.push('SUPABASE_USER_EMAIL or SUPABASE_USER_ID');
  if (missing.length) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.detail || text || `HTTP ${response.status}`;
    throw new Error(`${message} (${url})`);
  }

  return data;
}

async function odysseusJson(pathname) {
  return httpJson(`${config.odysseusUrl}${pathname}`, {
    headers: {
      Authorization: `Bearer ${config.odysseusToken}`,
      Accept: 'application/json'
    }
  });
}

async function supabaseJson(pathname, options = {}) {
  return httpJson(`${config.supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function getSupabaseUserId() {
  if (config.userId) return config.userId;

  const users = await supabaseJson('/auth/v1/admin/users?per_page=1000');
  const user = (users.users || []).find(
    (item) => String(item.email || '').toLowerCase() === config.userEmail.toLowerCase()
  );
  if (!user) {
    throw new Error(`No Supabase auth user found for ${config.userEmail}. Log in to the dashboard once first.`);
  }
  return user.id;
}

async function loadDashboardState(userId) {
  const rows = await supabaseJson(`/rest/v1/dashboard_state?user_id=eq.${encodeURIComponent(userId)}&select=data`);
  return rows?.[0]?.data || {};
}

async function saveDashboardState(userId, data) {
  await supabaseJson('/rest/v1/dashboard_state?on_conflict=user_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      user_id: userId,
      data,
      updated_at: new Date().toISOString()
    })
  });
}

async function saveTomorrowPicks(picks) {
  if (!picks.length) return;
  const rows = picks.map((pick) => ({
    id: `odysseus-${pick.source || 'ai'}-${pick.symbol}`.toLowerCase(),
    symbol: pick.symbol,
    source: pick.source || 'ai',
    score: pick.score ?? pick.confidence ?? null,
    signal: pick.signal || '',
    scanner: pick.scanner || 'Odysseus/NSE Sentinel',
    mode: pick.mode || '',
    data: pick,
    updated_at: new Date().toISOString()
  }));

  await supabaseJson('/rest/v1/tomorrow_picks?on_conflict=symbol,source', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
}

function ymd(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function hm(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeExport(payload) {
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const stockPicks = Array.isArray(payload.stock_picks?.picks)
    ? payload.stock_picks.picks
    : Array.isArray(payload.stock_picks)
      ? payload.stock_picks
      : [];

  const dashboardNotes = [];
  const dashboardTasks = [];

  for (const note of notes) {
    const items = Array.isArray(note.items) ? note.items : [];
    if (items.length) {
      items.forEach((item, index) => {
        const text = String(item?.text || '').trim();
        if (!text) return;
        dashboardTasks.push({
          id: `odysseus-task-${note.id}-${index}`,
          text,
          done: Boolean(item.done || item.checked),
          dueDate: ymd(note.due_date),
          priority: note.pinned ? 'High' : 'Normal',
          createdAt: note.created_at || new Date().toISOString(),
          origin: 'odysseus',
          sourceId: note.id
        });
      });
    } else {
      dashboardNotes.push({
        id: `odysseus-note-${note.id}`,
        title: note.title || 'Odysseus note',
        body: note.content || note.title || '',
        pinned: Boolean(note.pinned),
        createdAt: note.created_at || new Date().toISOString(),
        origin: 'odysseus',
        sourceId: note.id
      });
    }
  }

  const dashboardEvents = events.map((event) => ({
    id: `odysseus-event-${event.uid || event.id || event.dtstart || event.summary}`,
    title: event.summary || event.title || 'Odysseus event',
    date: ymd(event.dtstart || event.start),
    time: hm(event.dtstart || event.start),
    createdAt: event.created_at || new Date().toISOString(),
    origin: 'odysseus',
    sourceId: event.uid || event.id || ''
  })).filter((event) => event.date);

  const dashboardPicks = stockPicks.map((pick) => ({
    id: `odysseus-pick-${pick.source || 'ai'}-${pick.symbol}`.toLowerCase(),
    symbol: String(pick.symbol || '').toUpperCase(),
    source: String(pick.source || 'ai').toLowerCase() === 'manual' ? 'Manual' : 'AI',
    bias: pick.signal || pick.action || 'Watch',
    entry: pick.price ? String(pick.price) : '',
    target: '',
    stop: '',
    confidence: Number(pick.score || pick.tomorrow_score || 0) || 0,
    notes: pick.reason || '',
    chart_url: pick.chart_url || '',
    origin: 'odysseus'
  })).filter((pick) => pick.symbol);

  return {
    notes: dashboardNotes,
    tasks: dashboardTasks,
    events: dashboardEvents,
    picks: dashboardPicks
  };
}

function mergeByOrigin(existing, incoming, field) {
  const kept = Array.isArray(existing?.[field])
    ? existing[field].filter((item) => item.origin !== 'odysseus')
    : [];
  return [...incoming[field], ...kept];
}

async function main() {
  requireConfig();

  const capabilities = await odysseusJson('/api/codex/capabilities');
  if (!capabilities?.tools?.todos?.read && !capabilities?.tools?.calendar?.read) {
    throw new Error('Odysseus token needs Todos read and/or Calendar read scope.');
  }

  const end = new Date();
  end.setDate(end.getDate() + 60);
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const exportPath = `/api/codex/dashboard/export?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  const odysseus = await odysseusJson(exportPath);
  const normalized = normalizeExport(odysseus);
  const userId = await getSupabaseUserId();
  const current = await loadDashboardState(userId);

  const next = {
    ...current,
    notes: mergeByOrigin(current, normalized, 'notes'),
    tasks: mergeByOrigin(current, normalized, 'tasks'),
    events: mergeByOrigin(current, normalized, 'events'),
    picks: mergeByOrigin(current, normalized, 'picks'),
    updatedAt: new Date().toISOString()
  };

  await saveDashboardState(userId, next);
  await saveTomorrowPicks(normalized.picks);

  console.log(
    `Synced ${normalized.notes.length} notes, ${normalized.tasks.length} tasks, ${normalized.events.length} events, ${normalized.picks.length} picks to Supabase.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
