(function () {
  const STORAGE_KEY = 'hk-dashboard-state-v1';
  const FILE_BUCKET = 'dashboard-files';
  const ACCESS_KEY_STORAGE = 'hk-dashboard-access-key';
  const GATE_STORAGE = 'hk-dashboard-unlocked-v1';
  const DASHBOARD_PASSWORD_HASH = 'aea89001a424050979c7d8f5d8aee4609a8b8416a9828940a4aabca0f0809d20';
  const DEFAULT_ALBUM_ID = 'album-default';
  const ALBUM_UNLOCK_STORAGE = 'hk-dashboard-album-unlocked-v2';
  const ALBUM_PASSWORD_HASH = 'aaef22647a24721100b6e9d6c40d6cc603de3db95cd848b99fff75752f2ac64d';
  const DEFAULT_REMOTE_SITE_URL = 'https://hk-dashboard-omega.vercel.app';
  const SYNC_INTERVAL_MS = 20000;
  const config = window.HK_CONFIG || {};
  const root = document.getElementById('root');

  let client = null;
  let session = null;
  let saveTimer = null;
  let syncTimer = null;
  let realtimeChannel = null;
  let cloudBooted = false;
  let hasLoadedCloud = false;
  let statusText = 'Local browser saving';
  let syncText = 'Not synced yet';
  let notice = '';
  let state = mergeDashboard(readLocal());
const ui = {
    monthCursor: new Date(),
    selectedDate: todayKey(1),
    pickFilter: 'All',
    activeFileId: '',
    activeFileUrl: '',
    activeFileText: '',
    activeFileObjectUrl: '',
    activeFileLoading: false,
    activeFileError: '',
    selectedAlbumId: DEFAULT_ALBUM_ID,
    albumError: '',
    gateError: '',
    editingNoteId: ''
  };

  const quickLinks = [
    ['Test Paper Generator', 'https://edu-test-ai-rho.vercel.app/', 'TP'],
    ['Stock Screener', 'https://nse-sentinelmax-msrfjdkwmksf6jama4jvmx.streamlit.app/', 'ST'],
    ['TradingView', 'https://in.tradingview.com/', 'TV'],
    ['GitHub', 'https://github.com/', 'GH'],
    ['YouTube', 'https://www.youtube.com/', 'YT'],
    ['ChatGPT', 'https://chatgpt.com/', 'AI']
  ];

  function defaultAlbum(createdAt = '') {
    return {
      id: DEFAULT_ALBUM_ID,
      name: 'Default',
      locked: false,
      createdAt
    };
  }

  function albumIdFromName(name, index) {
    const slug = String(name || 'album')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `album-${slug || 'folder'}-${index}`;
  }

  function normalizeFiles(files) {
    return (Array.isArray(files) ? files : []).map((file) => ({
      ...file,
      albumId: file.albumId || DEFAULT_ALBUM_ID
    }));
  }

  function normalizeAlbums(albums, files, createdAt) {
    const map = new Map([[DEFAULT_ALBUM_ID, defaultAlbum(createdAt)]]);
    (Array.isArray(albums) ? albums : []).forEach((album, index) => {
      const name = String(album?.name || '').trim();
      if (!name) return;
      const id = album.id || albumIdFromName(name, index);
      map.set(id, {
        id,
        name,
        locked: Boolean(album.locked),
        createdAt: album.createdAt || createdAt
      });
    });

    (Array.isArray(files) ? files : []).forEach((file) => {
      const albumId = file.albumId || DEFAULT_ALBUM_ID;
      if (!map.has(albumId)) {
        map.set(albumId, {
          id: albumId,
          name: file.albumName || 'Imported',
          locked: false,
          createdAt: file.createdAt || createdAt
        });
      }
    });

    return Array.from(map.values());
  }

  function defaultDashboard() {
    const now = new Date().toISOString();
    return {
      notes: [],
      tasks: [],
      events: [],
      habits: [],
      picks: [],
      albums: [defaultAlbum(now)],
      photos: [],
      growthStartDate: todayKey(),
      updatedAt: now
    };
  }

  function mergeDashboard(input) {
    const defaults = defaultDashboard();
    const data = input && typeof input === 'object' ? input : {};
    const photos = normalizeFiles(Array.isArray(data.photos) ? data.photos : Array.isArray(data.files) ? data.files : defaults.photos);
    const albums = normalizeAlbums(Array.isArray(data.albums) ? data.albums : defaults.albums, photos, data.updatedAt || defaults.updatedAt);
    return cleanSeedData({
      ...defaults,
      ...data,
      notes: Array.isArray(data.notes) ? data.notes : defaults.notes,
      tasks: Array.isArray(data.tasks) ? data.tasks : defaults.tasks,
      events: Array.isArray(data.events) ? data.events : defaults.events,
      habits: Array.isArray(data.habits) ? data.habits : defaults.habits,
      picks: Array.isArray(data.picks) ? data.picks : defaults.picks,
      albums,
      photos,
      growthStartDate: data.growthStartDate || inferGrowthStartDate(data.habits) || defaults.growthStartDate,
      updatedAt: data.updatedAt || defaults.updatedAt
    });
  }

  function cleanSeedData(data) {
    return {
      ...data,
      notes: (data.notes || []).filter((note) => note.id !== 'note-welcome'),
      tasks: (data.tasks || []).filter((task) => task.id !== 'task-first'),
      habits: (data.habits || []).filter((habit) => habit.id !== 'habit-admin')
    };
  }

  function hasSeedData(data) {
    if (!data || typeof data !== 'object') return false;
    return (
      (Array.isArray(data.notes) && data.notes.some((note) => note.id === 'note-welcome')) ||
      (Array.isArray(data.tasks) && data.tasks.some((task) => task.id === 'task-first')) ||
      (Array.isArray(data.habits) && data.habits.some((habit) => habit.id === 'habit-admin'))
    );
  }

  function hasDashboardContent(data) {
    if (!data || typeof data !== 'object') return false;
    return ['notes', 'tasks', 'events', 'habits', 'picks', 'photos'].some((key) => {
      return Array.isArray(data[key]) && data[key].length > 0;
    }) || (Array.isArray(data.albums) && data.albums.length > 1);
  }

  function uid(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayKey(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dateKey(date);
  }

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function formatDisplayDate(key) {
    if (!key) return '';
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }

  function addDaysKey(startKey, offset) {
    const [year, month, day] = String(startKey || todayKey()).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + offset);
    return dateKey(date);
  }

  function isDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function habitStartKey(habit) {
    if (isDateKey(habit?.startDate)) return habit.startDate;
    if (habit?.createdAt) {
      const created = new Date(habit.createdAt);
      if (!Number.isNaN(created.getTime())) return dateKey(created);
    }
    const checkedDays = Object.keys(habit?.checks || {}).filter(isDateKey).sort();
    return checkedDays[0] || '';
  }

  function inferGrowthStartDate(habits) {
    const starts = (Array.isArray(habits) ? habits : [])
      .map(habitStartKey)
      .filter(isDateKey)
      .sort();
    return starts[0] || '';
  }

  function growthStartKey() {
    if (isDateKey(state.growthStartDate)) return state.growthStartDate;
    return inferGrowthStartDate(state.habits) || todayKey();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function formatBytes(size) {
    const bytes = Number(size) || 0;
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function fileUrl(file) {
    return file?.url || file?.dataUrl || '';
  }

  function fileType(file) {
    if (file?.type) return file.type;
    const match = String(fileUrl(file)).match(/^data:([^;,]+)/);
    return match ? match[1] : '';
  }

  function isTextFile(file) {
    const type = fileType(file);
    return type.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(type);
  }

  function fileKind(file) {
    const type = fileType(file);
    if (type.startsWith('image/')) return 'Image';
    if (type === 'application/pdf') return 'PDF';
    if (isTextFile(file)) return 'Text';
    if (type.includes('word')) return 'Doc';
    if (type.includes('spreadsheet') || type.includes('excel')) return 'Sheet';
    if (type.includes('zip') || type.includes('archive')) return 'Archive';
    return 'File';
  }

  function fileBadge(file) {
    const name = String(file?.name || '');
    const extension = name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : '';
    return extension || fileKind(file).slice(0, 4).toUpperCase();
  }

  function safeFileName(name) {
    return String(name || 'file')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 96);
  }

  function readFileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  function apiHeaders(extra = {}) {
    const headers = { ...extra };
    const accessKey = localStorage.getItem(ACCESS_KEY_STORAGE) || '';
    if (accessKey) headers['x-dashboard-access-key'] = accessKey;
    return headers;
  }

  function isLocalOrigin() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  function apiUrl(path) {
    const remote = String(config.SITE_URL || DEFAULT_REMOTE_SITE_URL).trim().replace(/\/+$/, '');
    if (isLocalOrigin() && remote && remote !== window.location.origin) {
      return `${remote}${path}`;
    }
    return path;
  }

  async function apiRequest(url, options = {}, retry = true) {
    const response = await fetch(apiUrl(url), {
      ...options,
      headers: apiHeaders(options.headers || {})
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

    if (response.status === 401 && retry) {
      const nextKey = window.prompt('Enter dashboard access key');
      if (nextKey) {
        localStorage.setItem(ACCESS_KEY_STORAGE, nextKey.trim());
        return apiRequest(url, options, false);
      }
    }

    if (!contentType.includes('application/json')) {
      throw new Error('Dashboard cloud API is not available here.');
    }

    if (!response.ok) {
      throw new Error(payload.error || 'Dashboard cloud request failed.');
    }

    return payload;
  }

  async function fileApi(action, body = {}, retry = true) {
    return apiRequest(
      `/api/files?action=${encodeURIComponent(action)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, action })
      },
      retry
    );
  }

  async function picksApi(action, body = {}, retry = true) {
    return apiRequest(
      `/api/picks?action=${encodeURIComponent(action)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, action })
      },
      retry
    );
  }

  function dataUrlToText(url) {
    const match = String(url || '').match(/^data:([^,]*),(.*)$/);
    if (!match) return '';
    try {
      const meta = match[1];
      const payload = match[2];
      if (meta.includes(';base64')) {
        const binary = atob(payload);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }
      return decodeURIComponent(payload);
    } catch {
      return '';
    }
  }

  function revokeActiveFileUrl() {
    if (ui.activeFileObjectUrl) {
      URL.revokeObjectURL(ui.activeFileObjectUrl);
      ui.activeFileObjectUrl = '';
    }
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : defaultDashboard();
    } catch {
      return defaultDashboard();
    }
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      setNotice('Local save failed. Export a backup if storage is full.');
    }
  }

  function setNotice(message) {
    notice = message;
    render();
  }

  function authRedirectUrl() {
    const configured = String(config.SITE_URL || '').trim().replace(/\/+$/, '');
    return configured || window.location.origin;
  }

  function markSynced(label = 'Synced') {
    syncText = `${label} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function mutate(recipe) {
    state = mergeDashboard(recipe(mergeDashboard(state)));
    state.updatedAt = new Date().toISOString();
    scheduleSave();
    render();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    writeLocal(state);
    saveTimer = setTimeout(saveCloud, 450);
  }

  function bootCloud() {
    if (cloudBooted) return;
    cloudBooted = true;
    initCloud().catch((error) => {
      statusText = `Cloud setup failed: ${error.message}`;
      render();
    });
  }

  async function initCloud() {
    await loadServerState({ force: true, silent: true }).catch(() => {});

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      statusText = 'Local browser saving';
      render();
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      statusText = 'Cloud config ready, Supabase script unavailable';
      render();
      return;
    }

    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    const result = await client.auth.getSession();
    session = result.data.session;
    statusText = session ? 'Supabase cloud sync' : 'Cloud ready, sign in to sync';
    if (session) {
      await syncCloudNow({ force: true, silent: true });
    } else {
      await syncCloudNow({ silent: true });
    }
    startCloudSync();

    client.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      statusText = session ? 'Supabase cloud sync' : 'Cloud ready, sign in to sync';
      hasLoadedCloud = false;
      await syncCloudNow({ force: true, silent: true });
      startCloudSync();
      render();
    });

    render();
  }

  function startCloudSync() {
    stopCloudSync();
    if (!client) return;

    syncTimer = setInterval(() => {
      syncCloudNow({ silent: true }).catch(() => {});
    }, SYNC_INTERVAL_MS);

    try {
      realtimeChannel = client.channel(`hk-dashboard-sync-${session?.user?.id || 'public'}`);
      if (session) {
        realtimeChannel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'dashboard_state',
            filter: `user_id=eq.${session.user.id}`
          },
          () => syncCloudNow({ force: true, silent: true }).catch(() => {})
        );
      }
      realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tomorrow_picks' },
        () => syncCloudNow({ force: true, silent: true }).catch(() => {})
      );
      realtimeChannel.subscribe();
    } catch {
      realtimeChannel = null;
    }
  }

  function stopCloudSync() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    if (realtimeChannel && client) {
      Promise.resolve(client.removeChannel(realtimeChannel)).catch(() => {});
      realtimeChannel = null;
    }
  }

  async function syncCloudNow(options = {}) {
    const { force = false, silent = false } = options;

    if (session) {
      await loadCloud({ force, silent: true });
    } else {
      await loadServerState({ force, silent: true }).catch(() => {});
      if (client) await loadCloudPicks({ silent: true });
    }

    markSynced(session ? 'Cloud synced' : 'Picks synced');
    if (!silent) {
      setNotice(session ? 'Latest cloud data synced.' : 'Latest stock picks synced.');
    } else {
      render();
    }
  }

  async function loadCloud(options = {}) {
    const { force = false, silent = false } = options;
    if (!client || !session) return;

    const result = await client
      .from('dashboard_state')
      .select('data,updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (result.error) {
      statusText = `Cloud load failed: ${result.error.message}`;
      return;
    }

    if (result.data && result.data.data) {
      const remoteHadSeed = hasSeedData(result.data.data);
      const remoteState = mergeDashboard(result.data.data);
      const remoteTime = Date.parse(result.data.updated_at || remoteState.updatedAt || '') || 0;
      const localTime = Date.parse(state.updatedAt || '') || 0;
      if (force || !hasLoadedCloud || remoteTime >= localTime) {
        state = remoteState;
        writeLocal(state);
        if (remoteHadSeed) await saveCloud();
      }
      hasLoadedCloud = true;
    } else {
      await saveCloud();
    }

    await loadCloudPicks({ silent });
  }

  async function loadCloudPicks(options = {}) {
    const { silent = false } = options;
    if (!client) return 0;

    const result = await client
      .from('tomorrow_picks')
      .select('id,symbol,source,score,signal,scanner,mode,data,updated_at')
      .order('updated_at', { ascending: false })
      .limit(40);

    if (result.error) {
      if (!silent) setNotice(`Stock picks load failed: ${result.error.message}`);
      return 0;
    }

    const cloudPicks = latestSyncedPickRows(result.data || []).map((row) =>
      normalizePick({
        ...(row.data || {}),
        id: row.id,
        symbol: row.symbol,
        source: row.source,
        score: row.score,
        signal: row.signal,
        scanner: row.scanner,
        mode: row.mode,
        origin: row.scanner || 'tomorrow_picks',
        updated_at: row.updated_at
      })
    );

    state = mergeDashboard({
      ...state,
      picks: mergePicks(
        state.picks.filter((pick) => !isSyncedStockPick(pick)),
        cloudPicks
      )
    });
    writeLocal(state);
    return cloudPicks.length;
  }

  async function loadServerState(options = {}) {
    const { force = false } = options;
    const payload = await apiRequest('/api/state', { method: 'GET' });
    const localState = mergeDashboard(state);
    const localHasContent = hasDashboardContent(localState);

    if (payload.data) {
      const remoteState = mergeDashboard(payload.data);
      const remoteHasContent = hasDashboardContent(remoteState);
      const remoteTime = Date.parse(payload.updatedAt || remoteState.updatedAt || '') || 0;
      const localTime = Date.parse(localState.updatedAt || '') || 0;

      if (localHasContent && (!remoteHasContent || localTime > remoteTime)) {
        await saveServerState();
        hasLoadedCloud = true;
        return true;
      }

      if (remoteHasContent || force || !hasLoadedCloud || remoteTime >= localTime) {
        state = remoteState;
        writeLocal(state);
      }
      hasLoadedCloud = true;
      return true;
    }

    if (localHasContent) {
      await saveServerState();
    }
    hasLoadedCloud = true;
    return false;
  }

  async function saveServerState() {
    const payload = await apiRequest('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: state })
    });
    markSynced('Saved');
    return payload;
  }

  async function saveCloud() {
    if (!session) {
      await saveServerState().catch(() => {});
      return;
    }
    if (!client) return;

    const result = await client.from('dashboard_state').upsert({
      user_id: session.user.id,
      data: state,
      updated_at: new Date().toISOString()
    });

    if (result.error) {
      statusText = `Cloud save failed: ${result.error.message}`;
      render();
    } else {
      markSynced('Saved');
    }
  }

  async function signIn(email) {
    if (!client) {
      setNotice('Add Supabase env vars first.');
      return;
    }

    const redirectTo = authRedirectUrl();
    const result = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo
      }
    });

    setNotice(result.error ? result.error.message : `Check your email for the login link. It will open ${redirectTo}.`);
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    hasLoadedCloud = false;
    statusText = 'Signed out, local saving active';
    syncText = 'Not synced yet';
    startCloudSync();
    render();
  }

  function monthDays(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - start.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const item = new Date(start);
      item.setDate(start.getDate() + index);
      return {
        key: dateKey(item),
        day: item.getDate(),
        muted: item.getMonth() !== month
      };
    });
  }

  function monthLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function eventCounts() {
    return state.events.reduce((map, event) => {
      if (event.done) return map;
      map[event.date] = (map[event.date] || 0) + 1;
      return map;
    }, {});
  }

  function pickValue(item, keys, fallback = '') {
    for (const key of keys) {
      if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') {
        return item[key];
      }
    }
    return fallback;
  }

  function tradingViewChartUrl(symbol) {
    const cleanSymbol = String(symbol || '').replace(/\.NS$/i, '').trim().toUpperCase();
    return cleanSymbol && cleanSymbol !== 'UNKNOWN'
      ? `https://www.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(cleanSymbol)}`
      : '';
  }

  function isSyncedStockRow(row) {
    const scanner = String(row?.scanner || '').toLowerCase();
    const id = String(row?.id || '').toLowerCase();
    return scanner.includes('nse sentinel') || id.startsWith('nse-') || id.startsWith('odysseus-');
  }

  function latestSyncedPickRows(rows) {
    const synced = rows.filter(isSyncedStockRow);
    const other = rows.filter((row) => !isSyncedStockRow(row));
    if (!synced.length) return rows;

    const latestTime = Math.max(
      ...synced.map((row) => Date.parse(row.updated_at || '') || 0)
    );
    if (!latestTime) return rows;

    const latestBatch = synced.filter((row) => {
      const rowTime = Date.parse(row.updated_at || '') || 0;
      return latestTime - rowTime <= 5000;
    });
    return [...latestBatch, ...other];
  }

  function isSyncedStockPick(pick) {
    const origin = String(pick?.origin || pick?.scanner || '').toLowerCase();
    const id = String(pick?.id || '').toLowerCase();
    const source = String(pick?.source || '').toUpperCase();
    return (
      origin.includes('nse sentinel') ||
      origin.includes('odysseus/nse') ||
      origin.includes('tomorrow_picks') ||
      id.startsWith('nse-') ||
      id.startsWith('odysseus-ai-') ||
      (source === 'AI' && !origin)
    );
  }

  function pickRange(item, lowKeys, highKeys) {
    const low = pickValue(item, lowKeys);
    const high = pickValue(item, highKeys);
    if (low && high) return `${low} - ${high}`;
    return low || high || '';
  }

  function formatPickScore(value) {
    const score = Number(value) || 0;
    return score ? `${score.toFixed(score % 1 ? 1 : 0)}/100` : '';
  }

  function renderPickRows(rows) {
    return rows
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
      .join('');
  }

  function normalizePick(item) {
    const data = item && item.data && typeof item.data === 'object' ? item.data : {};
    const snapshot =
      (data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : null) ||
      (item && item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : null) ||
      {};
    item = { ...snapshot, ...data, ...(item || {}) };
    const symbol = String(pickValue(item, ['symbol', 'ticker', 'name'], 'UNKNOWN')).toUpperCase();
    const entry = pickValue(item, ['entry', 'entry_price', 'Entry']) ||
      pickRange(item, ['entry_low', 'Entry Low'], ['entry_high', 'Entry High']);
    const target = pickValue(item, ['target', 'target_price', 'Target 1', 'Target']);
    const stop = pickValue(item, ['stop', 'stop_loss', 'sl', 'ATR SL', 'Stop Loss', 'Stop', 'SL']);
    const confidence = Number(pickValue(item, ['confidence', 'score', 'tomorrow_score', 'Prediction Score'], 0)) || 0;
    const chartUrl = String(pickValue(item, ['chart_url', 'TradingView', 'Chart'], '') || tradingViewChartUrl(symbol));
    return {
      id: item.id || uid('pick'),
      symbol,
      name: String(pickValue(item, ['name', 'company', 'title'], '')),
      source: String(pickValue(item, ['source', 'type'], 'Manual')).toLowerCase().includes('ai')
        ? 'AI'
        : 'Manual',
      bias: String(pickValue(item, ['bias', 'side', 'signal'], 'Watch')),
      price: String(pickValue(item, ['price', 'Price (\u20b9)', 'Price', 'Close', 'Last Price'], '')),
      entry: String(entry || ''),
      target: String(target || ''),
      target2: String(pickValue(item, ['target_2', 'Target 2'], '')),
      stop: String(stop || ''),
      timing: String(pickValue(item, ['timing', 'Entry Timing Aura', 'Entry Timing', 'Timing Reason'], '')),
      risk: String(pickValue(item, ['risk', 'Risk %', 'Risk Score', 'Trap Risk', 'Trap Risk Score'], '')),
      setup: String(pickValue(item, ['setup', 'Setup Type', 'AIL Category', 'Mode Name', 'Mode Label', 'bucket_label'], '')),
      volume: String(pickValue(item, ['volume', 'Volume', 'Vol / Avg', 'Volume Trend'], '')),
      rsi: String(pickValue(item, ['rsi', 'RSI'], '')),
      confidence,
      notes: String(pickValue(item, ['notes', 'reason', 'summary', 'Positive Reasons', 'Battle Notes', 'Smart Notes'], '')),
      warnings: String(pickValue(item, ['warnings', 'Warnings', 'Risk Notes', 'Gate Reasons'], '')),
      chartUrl,
      origin: item.origin || item.scanner || '',
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function mergePicks(existing, incoming) {
    const keyed = new Map();
    [...(existing || []), ...(incoming || [])].forEach((pick) => {
      const normalized = normalizePick(pick);
      const key = `${normalized.source}:${normalized.symbol}`;
      keyed.set(key, { ...keyed.get(key), ...normalized });
    });
    return Array.from(keyed.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source === 'AI' ? -1 : 1;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  function renderQuickLinks() {
    return quickLinks
      .map(([label, href, icon]) => {
        return `<a class="action-button" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">
          <span class="icon">${escapeHtml(icon)}</span>
          <span>${escapeHtml(label)}</span>
          <span class="external">open</span>
        </a>`;
      })
      .join('');
  }

  function renderCalendar() {
    const counts = eventCounts();
    const days = monthDays(ui.monthCursor)
      .map((day) => {
        const classes = [
          'day-cell',
          day.muted ? 'muted' : '',
          day.key === todayKey() ? 'today' : '',
          day.key === ui.selectedDate ? 'selected' : ''
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${classes}" data-date="${day.key}">
          <span>${day.day}</span>
          ${counts[day.key] ? `<b>${counts[day.key]}</b>` : ''}
        </button>`;
      })
      .join('');

    const selectedEvents = state.events
      .filter((event) => event.date === ui.selectedDate && !event.done)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const eventsHtml = selectedEvents.length
      ? selectedEvents
          .map((event) => {
            return `<div class="list-item event-item">
              <span class="icon">CA</span>
              <div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.time || 'All day')}</span></div>
              <div class="item-actions">
                <button type="button" class="finish-button" data-event-finish="${escapeHtml(event.id)}">Finish</button>
                <button type="button" class="remove-button" data-event-delete="${escapeHtml(event.id)}">Remove</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="empty">No events</p>';

    return `<article class="panel calendar-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Calendar</p><h2>${monthLabel(ui.monthCursor)}</h2></div>
        <div class="button-row">
          <button type="button" data-month="-1">Back</button>
          <button type="button" data-month="1">Next</button>
        </div>
      </header>
      <div class="weekday-row">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="month-grid">${days}</div>
      <div class="event-form">
        <input id="event-title" placeholder="Add reminder or event" />
        <input id="event-date" type="date" value="${ui.selectedDate || todayKey(1)}" />
        <input id="event-time" type="time" value="09:00" />
        <button type="button" id="add-event">Add</button>
      </div>
      <div class="list-block"><h3>${formatDisplayDate(ui.selectedDate)}</h3>${eventsHtml}</div>
    </article>`;
  }

  function renderNotesTasks() {
    const openTasks = state.tasks.filter((task) => !task.done);
    const tasksHtml = state.tasks.length
      ? state.tasks
          .slice(0, 8)
          .map((task) => {
            return `<div class="task-item ${task.done ? 'done' : ''}">
              <button type="button" class="task-toggle" data-task="${escapeHtml(task.id)}">
                <span class="icon">OK</span>
                <span>${escapeHtml(task.text)}</span>
                <small>${escapeHtml(task.priority || 'Normal')}</small>
              </button>
              <button type="button" class="remove-button" data-task-delete="${escapeHtml(task.id)}">Remove</button>
            </div>`;
          })
          .join('')
      : '<p class="empty">No todo</p>';

const notesHtml = state.notes.length
      ? state.notes
          .slice(0, 6)
          .map((note) => {
            const isEditing = ui.editingNoteId === note.id;
            const codeBlocks = Array.isArray(note.codeBlocks) ? note.codeBlocks : [];
            const titleField = isEditing
              ? `<input class="note-title-input" data-note-title-input="${escapeHtml(note.id)}" value="${escapeHtml(note.title || '')}" placeholder="Title" />`
              : `<strong>${escapeHtml(note.title || 'Untitled note')}</strong>`;
            const bodyField = isEditing
              ? `<textarea wrap="soft" data-note-body-input="${escapeHtml(note.id)}" placeholder="Write your note...">${escapeHtml(note.body || '')}</textarea>`
              : `<p class="note-body">${escapeHtml(note.body || '')}</p>`;
            const codeBlocksHtml = codeBlocks.length
              ? codeBlocks
                  .map((block, blockIndex) => {
                    const blockId = `${escapeHtml(note.id)}-${blockIndex}`;
                    const lang = String(block?.lang || 'text').trim() || 'text';
                    const content = String(block?.content || '');
                    if (isEditing) {
                      return `<div class="note-code-block-editor" data-code-block="${blockId}">
                        <div class="code-lang-row">
                          <input data-note-code-lang="${blockId}" value="${escapeHtml(lang)}" placeholder="language (js, py, sql…)" maxlength="24" />
                          <button type="button" class="remove-button" data-note-code-remove="${blockId}">Remove</button>
                        </div>
                        <textarea wrap="soft" data-note-code-input="${blockId}" placeholder="Paste your code here…">${escapeHtml(content)}</textarea>
                      </div>`;
                    }
                    return `<div class="note-code-block">
                      <div class="note-code-block-header">
                        <span class="lang-label">${escapeHtml(lang)}</span>
                        <button type="button" class="copy-button" data-note-copy-code="${blockId}">Copy</button>
                      </div>
                      <pre data-note-code-content="${blockId}">${escapeHtml(content)}</pre>
                    </div>`;
                  })
                  .join('')
              : '';
            const addCodeRow = isEditing
              ? `<div class="note-code-add-row">
                  <button type="button" class="add-code-button" data-note-code-add="${escapeHtml(note.id)}">+ Add code</button>
                </div>`
              : '';
            const editControls = isEditing
              ? `<div class="note-edit-actions">
                  <button type="button" class="remove-button" data-note-cancel="${escapeHtml(note.id)}">Cancel</button>
                  <button type="button" class="save-button" data-note-save="${escapeHtml(note.id)}">Save</button>
                </div>`
              : `<button type="button" class="edit-button" data-note-edit="${escapeHtml(note.id)}">Edit</button>`;
            return `<div class="note-card ${isEditing ? 'editing' : ''}">
              <div class="card-title-row">
                ${titleField}
                ${isEditing ? '' : `<button type="button" class="remove-button" data-note-delete="${escapeHtml(note.id)}">Remove</button>`}
              </div>
              ${bodyField}
              ${codeBlocksHtml}
              ${addCodeRow}
              <div class="note-edit-actions">${editControls}</div>
            </div>`;
          })
          .join('')
      : '<p class="empty">No notes</p>';

    return `<article class="panel notes-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Notes &amp; Todo</p><h2>${state.notes.length} notes, ${openTasks.length} todo</h2></div>
        <div class="button-row">
          <button type="button" id="add-note">Note</button>
          <button type="button" id="add-task">Task</button>
        </div>
      </header>
      <div class="compose-row">
        <input id="quick-text" placeholder="Add a task or note..." />
        <select id="task-priority">
          <option>Normal</option>
          <option>High</option>
          <option>Low</option>
        </select>
      </div>
      <textarea id="note-text" placeholder="Write a longer note..." rows="4"></textarea>
      <div class="split-list">
        <div><h3>Todo/tasks</h3>${tasksHtml}</div>
        <div><h3>Notes</h3>${notesHtml}</div>
      </div>
    </article>`;
  }

  function renderPicks() {
    const picks = state.picks.filter((pick) => ui.pickFilter === 'All' || pick.source === ui.pickFilter);
    const picksHtml = picks.length
      ? picks
          .slice(0, 10)
          .map((pick) => {
            const rows = renderPickRows([
              ['Price', pick.price],
              ['Entry', pick.entry],
              ['Target 1', pick.target],
              ['Target 2', pick.target2],
              ['Stop', pick.stop],
              ['Score', formatPickScore(pick.confidence)],
              ['Risk', pick.risk],
              ['Timing', pick.timing],
              ['Setup', pick.setup],
              ['Volume', pick.volume],
              ['RSI', pick.rsi]
            ]);
            return `<div class="pick-card">
              <div><strong>${escapeHtml(pick.symbol)}</strong><span>${escapeHtml(pick.source)}</span></div>
              <p>${escapeHtml(pick.bias || 'Watch')}</p>
              <dl>${rows || '<dt>Status</dt><dd>Waiting for detail sync</dd>'}</dl>
              ${pick.notes ? `<small class="pick-notes">${escapeHtml(pick.notes)}</small>` : ''}
              ${pick.warnings ? `<small class="pick-warning">${escapeHtml(pick.warnings)}</small>` : ''}
              <div class="pick-actions">
                ${pick.chartUrl ? `<a class="pick-link" href="${escapeHtml(pick.chartUrl)}" target="_blank" rel="noreferrer">Open chart</a>` : ''}
                <button type="button" class="remove-button" data-pick-delete="${escapeHtml(pick.id)}">Remove</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="empty">No picks yet</p>';

    return `<article class="panel picks-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Tomorrow's Picks</p><h2>${picks.length} stocks</h2></div>
        <div class="button-row">
          ${['All', 'AI', 'Manual']
            .map((option) => `<button type="button" class="${ui.pickFilter === option ? 'active' : ''}" data-pick-filter="${option}">${option}</button>`)
            .join('')}
          <button type="button" id="sync-picks">Sync</button>
        </div>
      </header>
      <div class="pick-form">
        <input id="pick-symbol" placeholder="Symbol" />
        <select id="pick-source"><option>Manual</option><option>AI</option></select>
        <input id="pick-bias" placeholder="Bias" value="Watch" />
        <input id="pick-entry" placeholder="Entry" />
        <input id="pick-target" placeholder="Target" />
        <button type="button" id="add-pick">Add</button>
      </div>
      <div class="picks-grid">${picksHtml}</div>
    </article>`;
  }

  function renderGrowth() {
    const startKey = growthStartKey();
    const days = Array.from({ length: 30 }, (_, index) => addDaysKey(startKey, index));
    const dayHeader = `<div class="habit-days"><span></span>${days.map((day) => `<b>${day.split('-')[2]}</b>`).join('')}</div>`;
    const rows = state.habits
      .map((habit) => {
        const done = Object.values(habit.checks || {}).filter(Boolean).length;
        return `<div class="habit-row">
          <div class="habit-name">
            <i style="background:${escapeHtml(habit.color || '#8b5cf6')}"></i>
            <span>${escapeHtml(habit.name)}</span>
            <small>${done}/30</small>
            <button type="button" class="remove-button" data-habit-delete="${escapeHtml(habit.id)}">Remove</button>
          </div>
          ${days
            .map((day) => `<button type="button" class="${habit.checks && habit.checks[day] ? 'checked' : ''}" data-habit="${escapeHtml(habit.id)}" data-habit-day="${day}" aria-label="${escapeHtml(habit.name)} ${day}"></button>`)
            .join('')}
        </div>`;
      })
      .join('');

    return `<article class="panel growth-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Growth</p><h2>30-day progress</h2></div>
        <span class="icon large">GY</span>
      </header>
      <div class="habit-form">
        <input id="habit-name" placeholder="Add habit name" />
        <button type="button" id="add-habit">Add</button>
      </div>
      <div class="habit-table">${dayHeader}${rows}</div>
    </article>`;
  }

  function activeAlbum() {
    const albums = state.albums && state.albums.length ? state.albums : [defaultAlbum(state.updatedAt)];
    return albums.find((album) => album.id === ui.selectedAlbumId) || albums[0] || defaultAlbum(state.updatedAt);
  }

  function albumUnlockKey(id) {
    return `${ALBUM_UNLOCK_STORAGE}-${id}`;
  }

  function isAlbumUnlocked(album) {
    if (!album?.locked) return true;
    try {
      return sessionStorage.getItem(albumUnlockKey(album.id)) === 'yes';
    } catch {
      return false;
    }
  }

  function renderGallery() {
    const albums = state.albums && state.albums.length ? state.albums : [defaultAlbum(state.updatedAt)];
    const album = activeAlbum();
    const locked = !isAlbumUnlocked(album);
    const files = (state.photos || []).filter((file) => (file.albumId || DEFAULT_ALBUM_ID) === album.id);
    const visibleFiles = locked ? [] : files;
const totalSize = visibleFiles.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    const albumTabs = albums
      .map((item) => {
        const isLockedTab = item.locked && !isAlbumUnlocked(item);
        const count = isLockedTab
          ? '•••'
          : (state.photos || []).filter((file) => (file.albumId || DEFAULT_ALBUM_ID) === item.id).length;
        const active = item.id === album.id ? 'active' : '';
        const lock = item.locked ? ' locked' : '';
        return `<button type="button" class="${active}${lock}" data-album-select="${escapeHtml(item.id)}">
          <span>${item.locked ? 'Locked' : 'Album'}</span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${count}</small>
        </button>`;
      })
      .join('');
    const lockedHtml = `<div class="album-lock-panel">
      <span class="file-icon large">LOCK</span>
      <div>
        <h3>${escapeHtml(album.name)} is locked</h3>
        <p class="muted-copy">Enter album password to open these files.</p>
        <form class="album-unlock-form" id="album-unlock-form">
          <input id="album-password" type="password" placeholder="Album password" autocomplete="current-password" />
          <button type="submit">Unlock</button>
        </form>
        ${ui.albumError ? `<p class="gate-error">${escapeHtml(ui.albumError)}</p>` : ''}
      </div>
    </div>`;
    const filesHtml = visibleFiles.length
      ? visibleFiles
          .slice(0, 8)
          .map(renderFileCard)
          .join('')
      : '<p class="empty">No files yet</p>';

    return `<article class="panel gallery-panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">Gallery &amp; Files</p>
          <h2>${escapeHtml(album.name)} - ${locked ? 'locked' : `${visibleFiles.length} files`}</h2>
          <p>${locked ? 'Enter password to view files' : formatBytes(totalSize)}</p>
        </div>
        <div class="button-row">
          ${album.id !== DEFAULT_ALBUM_ID && !locked ? `<button type="button" class="remove-button" data-album-delete="${escapeHtml(album.id)}">Remove album</button>` : ''}
          <label class="file-button ${locked ? 'disabled' : ''}">Upload<input id="file-input" type="file" multiple ${locked ? 'disabled' : ''} /></label>
        </div>
      </header>
      <div class="album-form">
        <input id="album-name" placeholder="New album/folder name" />
        <label class="checkbox-line"><input id="album-locked" type="checkbox" /> Lock with password</label>
        <button type="button" id="add-album">Add album</button>
      </div>
      <div class="album-tabs">${albumTabs}</div>
      ${locked ? lockedHtml : `<div class="photo-grid">${filesHtml}</div>`}
    </article>`;
  }

  function renderFileCard(file) {
    const id = escapeHtml(file.id);
    const name = escapeHtml(file.name || 'Untitled file');
    const kind = fileKind(file);
    const imageSource = file.thumbUrl || (fileType(file).startsWith('image/') ? fileUrl(file) : '');
    const previewHtml = imageSource
      ? `<img src="${escapeHtml(imageSource)}" alt="${name}" /><span class="file-icon fallback">${escapeHtml(fileBadge(file))}</span>`
      : `<span class="file-icon">${escapeHtml(fileBadge(file))}</span>`;

    return `<figure class="file-card">
      <button type="button" class="file-preview" data-file-open="${id}" aria-label="Open ${name}">
        ${previewHtml}
      </button>
      <figcaption>
        <button type="button" class="file-name" data-file-open="${id}">${name}</button>
        <span>${escapeHtml(kind)} &middot; ${formatBytes(file.size)}</span>
        <div class="file-actions">
          <button type="button" data-file-download="${id}">Download</button>
          <button type="button" data-file-delete="${id}">Remove</button>
        </div>
      </figcaption>
    </figure>`;
  }

  function renderFileModal() {
    const file = (state.photos || []).find((item) => item.id === ui.activeFileId);
    if (!file) return '';

    const name = escapeHtml(file.name || 'Untitled file');
    const preview = renderFilePreview(file);

    return `<div class="file-modal" role="dialog" aria-modal="true" aria-label="${name}">
      <section class="file-modal-card">
        <header class="file-modal-header">
          <div>
            <p class="eyebrow">${escapeHtml(fileKind(file))} &middot; ${formatBytes(file.size)}</p>
            <h2>${name}</h2>
          </div>
          <div class="button-row">
            <button type="button" data-file-download="${escapeHtml(file.id)}">Download</button>
            <button type="button" id="file-modal-close">Close</button>
          </div>
        </header>
        <div class="file-modal-body">${preview}</div>
      </section>
    </div>`;
  }

  function renderFilePreview(file) {
    if (ui.activeFileLoading) return '<p class="empty">Opening file...</p>';
    if (ui.activeFileError) return `<p class="empty">${escapeHtml(ui.activeFileError)}</p>`;

    const source = ui.activeFileUrl || fileUrl(file);
    const type = fileType(file);
    if (type.startsWith('image/') && source) {
      return `<img class="file-view-image" src="${escapeHtml(source)}" alt="${escapeHtml(file.name)}" />`;
    }
    if (type === 'application/pdf' && source) {
      return `<iframe class="file-view-frame" src="${escapeHtml(source)}" title="${escapeHtml(file.name)}"></iframe>`;
    }
    if (isTextFile(file)) {
      const text = ui.activeFileText || dataUrlToText(source);
      return `<pre class="file-view-text">${escapeHtml(text || 'No preview text available.')}</pre>`;
    }
    return `<div class="file-view-generic">
      <span class="file-icon large">${escapeHtml(fileBadge(file))}</span>
      <p>${escapeHtml(file.name || 'File')}</p>
      <small>${formatBytes(file.size)} &middot; download to open this format</small>
    </div>`;
  }

  function renderAccount() {
    const cloudReady = Boolean(client);
    const authHtml = cloudReady
      ? session
        ? `<div class="account-box">
            <div><p>Signed in as ${escapeHtml(session.user.email)}</p><small>${escapeHtml(syncText)}</small></div>
            <div class="button-row"><button type="button" id="sync-now">Sync now</button><button type="button" id="sign-out">Sign out</button></div>
          </div>`
        : `<form class="account-form" id="sign-in-form"><input id="email" type="email" placeholder="Email for cloud sync" required /><button type="submit">Send link</button></form>`
      : '<p class="muted-copy">Local saving is active. Add Supabase env vars on Vercel for cloud login and cross-device sync.</p>';
    const syncMode = session ? 'Dashboard auto-syncs every 20 seconds' : 'Sign in once to sync notes, tasks, files, and habits';
    const fileMode = session ? 'Files upload to private Supabase Storage' : 'Files stay in this browser until sign in';

    return `<article class="panel account-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Save &amp; Access</p><h2>${escapeHtml(statusText)}</h2></div>
        <span class="icon large">ID</span>
      </header>
      ${authHtml}
      <div class="backup-row">
        <button type="button" id="export-json">Export JSON</button>
        <label class="file-button">Import JSON<input id="import-json" type="file" accept="application/json" /></label>
      </div>
      <div class="connection-list">
        <span><span class="icon">DB</span> ${escapeHtml(syncMode)}</span>
        <span><span class="icon">ST</span> Stock picks auto-refresh from Supabase</span>
        <span><span class="icon">FL</span> ${escapeHtml(fileMode)}</span>
      </div>
    </article>`;
  }

  function isDashboardUnlocked() {
    try {
      return sessionStorage.getItem(GATE_STORAGE) === 'yes';
    } catch {
      return false;
    }
  }

  async function hashText(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function renderPasswordGate() {
    return `<main class="gate-shell">
      <section class="gate-card">
        <div class="gate-brand">
          <div class="brand-mark"><img class="brand-logo" src="/hk-logo.svg" alt="HK logo" /></div>
          <div>
            <p class="eyebrow">Private Dashboard</p>
            <h1>HK Dashboard</h1>
          </div>
        </div>
        <h2>Meet Your Father Who is Hritvik</h2>
        <p class="gate-copy">To see the Dashboard, enter the password.</p>
        <form class="gate-form" id="gate-form">
          <input id="gate-password" type="password" placeholder="Password" autocomplete="current-password" />
          <button type="submit" id="gate-submit">Open Dashboard</button>
        </form>
        ${ui.gateError ? `<p class="gate-error">${escapeHtml(ui.gateError)}</p>` : ''}
      </section>
    </main>`;
  }

  function bindGateEvents() {
    const form = document.getElementById('gate-form');
    const input = document.getElementById('gate-password');
    const submit = document.getElementById('gate-submit');
    input?.focus();

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = input?.value.trim() || '';
      if (submit) submit.disabled = true;

      try {
        if (!window.crypto?.subtle) {
          throw new Error('Secure browser crypto is not available here.');
        }

        const matches = (await hashText(password)) === DASHBOARD_PASSWORD_HASH;
        if (!matches) {
          ui.gateError = 'Wrong password.';
          render();
          return;
        }

        sessionStorage.setItem(GATE_STORAGE, 'yes');
        localStorage.setItem(ACCESS_KEY_STORAGE, password);
        ui.gateError = '';
        render();
        bootCloud();
      } catch (error) {
        ui.gateError = error.message || 'Could not unlock dashboard.';
        render();
      }
    });
  }

  function render() {
    if (!isDashboardUnlocked()) {
      root.innerHTML = renderPasswordGate();
      bindGateEvents();
      return;
    }

    const now = new Date();
    const openTasks = state.tasks.filter((task) => !task.done);
    const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';

    root.innerHTML = `<main class="app-shell">
      <section class="hero-panel">
        <div class="status-strip">
          <div class="brand-mark"><img class="brand-logo" src="/hk-logo.svg" alt="HK logo" /></div>
          <div><p class="eyebrow">Personal Workspace</p><h1>HK Dashboard</h1></div>
          <div class="clock-card"><span>${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
        <div class="hero-grid">
          <div class="welcome-card">
            <p class="eyebrow">Today</p>
            <h2>Good ${greeting}</h2>
            <p>${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <div class="mini-stats">
              <span>${openTasks.length} open tasks</span>
              <span>${state.notes.length} notes</span>
              <span>${state.picks.length} picks</span>
            </div>
          </div>
          <div class="quick-links">${renderQuickLinks()}</div>
        </div>
      </section>
      ${notice ? `<button class="notice" type="button" id="clear-notice">${escapeHtml(notice)}</button>` : ''}
      <section class="dashboard-grid">
        ${renderCalendar()}
        ${renderNotesTasks()}
        ${renderPicks()}
        ${renderGrowth()}
        ${renderGallery()}
      </section>
    </main>
    ${renderFileModal()}`;

    bindEvents();
  }

  function bindEvents() {
    const byId = (id) => document.getElementById(id);
    byId('clear-notice')?.addEventListener('click', () => {
      notice = '';
      render();
    });

    document.querySelectorAll('[data-month]').forEach((button) => {
      button.addEventListener('click', () => {
        const delta = Number(button.dataset.month);
        ui.monthCursor = new Date(ui.monthCursor.getFullYear(), ui.monthCursor.getMonth() + delta, 1);
        render();
      });
    });

    document.querySelectorAll('[data-date]').forEach((button) => {
      button.addEventListener('click', () => {
        ui.selectedDate = button.dataset.date;
        render();
      });
    });

    document.querySelectorAll('[data-event-finish]').forEach((button) => {
      button.addEventListener('click', () => finishEvent(button.dataset.eventFinish));
    });

    document.querySelectorAll('[data-event-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteEvent(button.dataset.eventDelete));
    });

    byId('add-event')?.addEventListener('click', addEvent);
    byId('add-task')?.addEventListener('click', addTask);
    byId('add-note')?.addEventListener('click', addNote);
    byId('quick-text')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addTask();
    });

    document.querySelectorAll('[data-task]').forEach((button) => {
      button.addEventListener('click', () => toggleTask(button.dataset.task));
    });

    document.querySelectorAll('[data-task-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteTask(button.dataset.taskDelete));
    });

document.querySelectorAll('[data-note-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteNote(button.dataset.noteDelete));
    });

    document.querySelectorAll('[data-note-edit]').forEach((button) => {
      button.addEventListener('click', () => startEditingNote(button.dataset.noteEdit));
    });

    document.querySelectorAll('[data-note-cancel]').forEach((button) => {
      button.addEventListener('click', () => cancelEditingNote());
    });

    document.querySelectorAll('[data-note-save]').forEach((button) => {
      button.addEventListener('click', () => saveNoteEdit(button.dataset.noteSave));
    });

    document.querySelectorAll('[data-note-code-add]').forEach((button) => {
      button.addEventListener('click', () => addCodeBlockToNote(button.dataset.noteCodeAdd));
    });

    document.querySelectorAll('[data-note-code-remove]').forEach((button) => {
      button.addEventListener('click', () => removeCodeBlockFromEditingNote(button.dataset.noteCodeRemove));
    });

    document.querySelectorAll('[data-note-copy-code]').forEach((button) => {
      button.addEventListener('click', (event) => copyCodeBlock(event.currentTarget));
    });

    document.querySelectorAll('[data-note-body-input]').forEach((textarea) => {
      textarea.addEventListener('paste', normalizeNotePaste);
    });

    document.querySelectorAll('[data-pick-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        ui.pickFilter = button.dataset.pickFilter;
        render();
      });
    });

    byId('add-pick')?.addEventListener('click', addPick);
    byId('sync-picks')?.addEventListener('click', syncPicks);
    document.querySelectorAll('[data-pick-delete]').forEach((button) => {
      button.addEventListener('click', () => deletePick(button.dataset.pickDelete));
    });

    byId('add-habit')?.addEventListener('click', addHabit);
    byId('habit-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addHabit();
    });

    document.querySelectorAll('[data-habit]').forEach((button) => {
      button.addEventListener('click', () => toggleHabit(button.dataset.habit, button.dataset.habitDay));
    });

    document.querySelectorAll('[data-habit-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteHabit(button.dataset.habitDelete));
    });

    document.querySelectorAll('[data-file-open]').forEach((button) => {
      button.addEventListener('click', () => openFile(button.dataset.fileOpen));
    });

    document.querySelectorAll('[data-file-download]').forEach((button) => {
      button.addEventListener('click', () => downloadFile(button.dataset.fileDownload));
    });

    document.querySelectorAll('[data-file-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteFile(button.dataset.fileDelete));
    });

    document.querySelectorAll('[data-album-select]').forEach((button) => {
      button.addEventListener('click', () => selectAlbum(button.dataset.albumSelect));
    });

    document.querySelectorAll('[data-album-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteAlbum(button.dataset.albumDelete));
    });

    byId('add-album')?.addEventListener('click', addAlbum);
    byId('album-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addAlbum();
    });

    byId('album-unlock-form')?.addEventListener('submit', unlockActiveAlbum);

    document.querySelectorAll('.file-preview img').forEach((image) => {
      image.addEventListener('error', () => {
        image.closest('.file-preview')?.classList.add('preview-failed');
      });
    });

    byId('file-input')?.addEventListener('change', addFiles);
    byId('file-modal-close')?.addEventListener('click', closeFile);
    document.querySelector('.file-modal')?.addEventListener('click', (event) => {
      if (event.target.classList.contains('file-modal')) closeFile();
    });
    byId('export-json')?.addEventListener('click', exportJson);
    byId('import-json')?.addEventListener('change', importJson);
    byId('sync-now')?.addEventListener('click', () => {
      syncCloudNow({ force: true, silent: false }).catch((error) => {
        setNotice(error.message || 'Sync failed.');
      });
    });

    byId('sign-in-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = byId('email').value.trim();
      if (email) signIn(email);
    });

    byId('sign-out')?.addEventListener('click', signOut);
  }

  function addTask() {
    const text = document.getElementById('quick-text')?.value.trim();
    const priority = document.getElementById('task-priority')?.value || 'Normal';
    if (!text) return;

    mutate((current) => ({
      ...current,
      tasks: [
        {
          id: uid('task'),
          text,
          done: false,
          dueDate: '',
          priority,
          createdAt: new Date().toISOString()
        },
        ...current.tasks
      ]
    }));
  }

  function addNote() {
    const quick = document.getElementById('quick-text')?.value.trim() || '';
    const body = document.getElementById('note-text')?.value.trim() || quick;
    if (!body) return;

    mutate((current) => ({
      ...current,
      notes: [
        {
          id: uid('note'),
          title: body.split('\n')[0].slice(0, 60),
          body,
          pinned: false,
          createdAt: new Date().toISOString()
        },
        ...current.notes
      ]
    }));
  }

  function confirmDelete(label) {
    return window.confirm(`Remove ${label}? This cannot be undone.`);
  }

  function toggleTask(id) {
    mutate((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              done: !task.done,
              completedAt: !task.done ? new Date().toISOString() : ''
            }
          : task
      )
    }));
  }

function deleteTask(id) {
    if (!id || !confirmDelete('this task')) return;
    mutate((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id)
    }));
    setNotice('Task removed.');
  }

  function deleteNote(id) {
    if (!id || !confirmDelete('this note')) return;
    if (ui.editingNoteId === id) ui.editingNoteId = '';
    mutate((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== id)
    }));
    setNotice('Note removed.');
  }

  function startEditingNote(id) {
    if (!id) return;
    ui.editingNoteId = id;
    render();
    const textarea = document.querySelector(`[data-note-body-input="${id}"]`);
    if (textarea) {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }

  function cancelEditingNote() {
    ui.editingNoteId = '';
    render();
  }

  function saveNoteEdit(id) {
    if (!id) return;
    const titleInput = document.querySelector(`[data-note-title-input="${id}"]`);
    const bodyInput = document.querySelector(`[data-note-body-input="${id}"]`);
    const newTitle = String(titleInput?.value || '').trim();
    const newBody = String(bodyInput?.value || '').trim();
    if (!newBody) {
      setNotice('Note body cannot be empty.');
      return;
    }
    const codeBlocks = collectCodeBlocksFromEditing(id);
    ui.editingNoteId = '';
    mutate((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              title: newTitle || newBody.split('\n')[0].slice(0, 60),
              body: newBody,
              codeBlocks,
              updatedAt: new Date().toISOString()
            }
          : note
      )
    }));
    setNotice('Note updated.');
  }

  function collectCodeBlocksFromEditing(noteId) {
    const blocks = [];
    document.querySelectorAll(`[data-code-block^="${noteId}-"]`).forEach((wrapper) => {
      const blockId = wrapper.getAttribute('data-code-block');
      const langInput = document.querySelector(`[data-note-code-lang="${blockId}"]`);
      const contentInput = document.querySelector(`[data-note-code-input="${blockId}"]`);
      const lang = String(langInput?.value || '').trim() || 'text';
      const content = String(contentInput?.value || '').replace(/\r\n?/g, '\n');
      blocks.push({ lang, content });
    });
    return blocks;
  }

  function addCodeBlockToNote(noteId) {
    if (!noteId) return;
    const existing = (state.notes || []).find((note) => note.id === noteId);
    if (!existing) return;
    mutate((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              codeBlocks: [
                ...(Array.isArray(note.codeBlocks) ? note.codeBlocks : []),
                { lang: 'text', content: '' }
              ]
            }
          : note
      )
    }));
    if (ui.editingNoteId !== noteId) ui.editingNoteId = noteId;
    render();
    setTimeout(() => {
      const last = document.querySelectorAll(`[data-code-block^="${noteId}-"]`);
      const wrapper = last[last.length - 1];
      const ta = wrapper?.querySelector('textarea[data-note-code-input]');
      if (ta) ta.focus();
    }, 0);
  }

  function removeCodeBlockFromEditingNote(blockId) {
    if (!blockId) return;
    const dashIndex = blockId.lastIndexOf('-');
    if (dashIndex < 0) return;
    const noteId = blockId.slice(0, dashIndex);
    const index = Number(blockId.slice(dashIndex + 1));
    if (!Number.isFinite(index)) return;
    mutate((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.id !== noteId) return note;
        const next = (Array.isArray(note.codeBlocks) ? note.codeBlocks : []).slice();
        next.splice(index, 1);
        return { ...note, codeBlocks: next };
      })
    }));
  }

  async function copyCodeBlock(button) {
    const blockId = button.getAttribute('data-note-copy-code');
    if (!blockId) return;
    const pre = document.querySelector(`[data-note-code-content="${blockId}"]`);
    const text = pre ? pre.textContent || '' : '';
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        copied = document.execCommand('copy');
        document.body.removeChild(fallback);
      }
    } catch {
      copied = false;
    }
    const original = button.textContent;
    button.textContent = copied ? 'Copied' : 'Failed';
    button.classList.toggle('copied', copied);
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copied');
    }, 1500);
  }

  function normalizeNotePaste(event) {
    if (!event.clipboardData) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const cleaned = text.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ');
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const insertAtEnd = start === target.value.length;
    let nextValue;
    let caret;
    if (insertAtEnd) {
      const needsLeadingBreak = before.length && !before.endsWith('\n');
      const prefix = needsLeadingBreak ? '\n' : '';
      nextValue = before + prefix + cleaned;
      caret = nextValue.length;
    } else {
      nextValue = before + cleaned + after;
      caret = before.length + cleaned.length;
    }
    target.value = nextValue;
    target.setSelectionRange(caret, caret);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function finishEvent(id) {
    if (!id) return;
    mutate((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === id
          ? {
              ...event,
              done: true,
              completedAt: new Date().toISOString()
            }
          : event
      )
    }));
  }

  function deleteEvent(id) {
    if (!id || !confirmDelete('this calendar item')) return;
    mutate((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== id)
    }));
    setNotice('Calendar item removed.');
  }

  function addEvent() {
    const title = document.getElementById('event-title')?.value.trim();
    const date = document.getElementById('event-date')?.value || ui.selectedDate || todayKey(1);
    const time = document.getElementById('event-time')?.value || '';
    if (!title) return;

    mutate((current) => ({
      ...current,
      events: [
        ...current.events,
        {
          id: uid('event'),
          title,
          date,
          time,
          done: false,
          createdAt: new Date().toISOString()
        }
      ]
    }));
    ui.selectedDate = date;
  }

  function addPick() {
    const pick = normalizePick({
      symbol: document.getElementById('pick-symbol')?.value.trim(),
      source: document.getElementById('pick-source')?.value,
      bias: document.getElementById('pick-bias')?.value.trim(),
      entry: document.getElementById('pick-entry')?.value.trim(),
      target: document.getElementById('pick-target')?.value.trim()
    });
    if (!pick.symbol || pick.symbol === 'UNKNOWN') return;

    mutate((current) => ({
      ...current,
      picks: [pick, ...current.picks]
    }));
  }

  async function deletePick(id) {
    const pick = state.picks.find((item) => item.id === id);
    if (!pick || !confirmDelete(`${pick.symbol || 'this stock pick'}`)) return;

    if (isSyncedStockPick(pick)) {
      try {
        await picksApi('delete', {
          id: pick.id,
          symbol: pick.symbol,
          source: String(pick.source || '').toLowerCase()
        });
      } catch (error) {
        setNotice(error.message || 'Could not remove stock pick from database.');
        return;
      }
    }

    mutate((current) => ({
      ...current,
      picks: current.picks.filter((item) => item.id !== id)
    }));
    setNotice('Stock pick removed.');
  }

  async function syncPicks() {
    if (client) {
      const count = await loadCloudPicks();
      if (count) {
        setNotice(`Loaded ${count} picks from Supabase.`);
        render();
        return;
      }
    }

    if (!config.STOCK_PICKS_URL) {
      setNotice('No Supabase picks yet. Run the scanner after adding Streamlit Supabase secrets.');
      return;
    }

    try {
      setNotice('Syncing tomorrow picks...');
      const response = await fetch(config.STOCK_PICKS_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const incoming = Array.isArray(payload) ? payload : payload.picks || payload.data || [];
      const picks = incoming.map(normalizePick);
      mutate((current) => ({
        ...current,
        picks: [...picks, ...current.picks.filter((pick) => pick.source !== 'AI')]
      }));
      setNotice(`Synced ${picks.length} picks.`);
    } catch (error) {
      setNotice(`Pick sync failed: ${error.message}`);
    }
  }

  function addHabit() {
    const name = document.getElementById('habit-name')?.value.trim();
    if (!name) return;

    mutate((current) => ({
      ...current,
      growthStartDate: current.growthStartDate || todayKey(),
      habits: [
        ...current.habits,
        {
          id: uid('habit'),
          name,
          color: '#8b5cf6',
          startDate: current.growthStartDate || todayKey(),
          createdAt: new Date().toISOString(),
          checks: {}
        }
      ]
    }));
  }

  function toggleHabit(id, day) {
    mutate((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== id) return habit;
        const checks = { ...(habit.checks || {}) };
        if (checks[day]) {
          delete checks[day];
        } else {
          checks[day] = true;
        }
        return { ...habit, startDate: habitStartKey(habit) || day, checks };
      })
    }));
  }

  function deleteHabit(id) {
    if (!id || !confirmDelete('this growth habit')) return;
    mutate((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== id),
      growthStartDate: inferGrowthStartDate(current.habits.filter((habit) => habit.id !== id)) || current.growthStartDate
    }));
    setNotice('Growth habit removed.');
  }

function selectAlbum(id) {
    if (!id) return;
    const target = (state.albums || []).find((item) => item.id === id);
    ui.selectedAlbumId = id;
    ui.albumError = '';
    if (target && target.locked && !isAlbumUnlocked(target)) {
      revokeActiveFileUrl();
      ui.activeFileId = '';
      ui.activeFileUrl = '';
      ui.activeFileText = '';
      ui.activeFileLoading = false;
      ui.activeFileError = '';
    }
    render();
  }

  function addAlbum() {
    const name = document.getElementById('album-name')?.value.trim();
    const locked = Boolean(document.getElementById('album-locked')?.checked);
    if (!name) return;

    const id = uid('album');
    ui.selectedAlbumId = id;
    ui.albumError = '';

    mutate((current) => ({
      ...current,
      albums: [
        ...current.albums,
        {
          id,
          name,
          locked,
          createdAt: new Date().toISOString()
        }
      ]
    }));
  }

  async function unlockActiveAlbum(event) {
    event.preventDefault();
    const album = activeAlbum();
    const password = document.getElementById('album-password')?.value.trim() || '';

    try {
      if ((await hashText(password)) !== ALBUM_PASSWORD_HASH) {
        ui.albumError = 'Wrong album password.';
        render();
        return;
      }

      sessionStorage.setItem(albumUnlockKey(album.id), 'yes');
      ui.albumError = '';
      render();
    } catch (error) {
      ui.albumError = error.message || 'Could not unlock album.';
      render();
    }
  }

  async function deleteAlbum(id) {
    const album = (state.albums || []).find((item) => item.id === id);
    if (!album || album.id === DEFAULT_ALBUM_ID) return;
    if (!confirmDelete(`album "${album.name}" and all files inside it`)) return;

    const files = (state.photos || []).filter((file) => (file.albumId || DEFAULT_ALBUM_ID) === album.id);
    try {
      for (const file of files) {
        await removeStoredFile(file);
      }
    } catch (error) {
      setNotice(error.message || 'Could not remove every cloud file in this album.');
      return;
    }

    if (files.some((file) => file.id === ui.activeFileId)) closeFile();
    ui.selectedAlbumId = DEFAULT_ALBUM_ID;

    mutate((current) => ({
      ...current,
      albums: current.albums.filter((item) => item.id !== id),
      photos: current.photos.filter((file) => (file.albumId || DEFAULT_ALBUM_ID) !== id)
    }));
    setNotice('Album and its files removed.');
  }

async function addFiles(event) {
    const selected = Array.from((event.target.files || [])).filter(Boolean);
    event.target.value = '';
    if (!selected.length) return;
    const album = activeAlbum();
    if (!album || !isAlbumUnlocked(album)) {
      setNotice('Unlock this album before uploading files.');
      return;
    }

    setNotice(`Uploading ${selected.length} file${selected.length === 1 ? '' : 's'}...`);
    const uploaded = [];
    let usedLocalFallback = false;

    for (const file of selected) {
      try {
        uploaded.push(await uploadStoredFile(file, album.id));
      } catch (error) {
        console.warn('Cloud file upload failed; using browser fallback.', error);
        uploaded.push(await createLocalFileRecord(file, album.id));
        usedLocalFallback = true;
      }
    }

    mutate((current) => ({
      ...current,
      photos: [...uploaded, ...current.photos]
    }));

    setNotice(
      usedLocalFallback
        ? 'Some files were saved only in this browser because cloud storage was not ready.'
        : `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} saved to cloud storage.`
    );
  }

  async function createLocalFileRecord(file, albumId = DEFAULT_ALBUM_ID) {
    const dataUrl = await readFileDataUrl(file);
    return {
      id: uid('file'),
      name: file.name,
      type: file.type || 'application/octet-stream',
      url: dataUrl,
      size: file.size,
      albumId,
      createdAt: new Date().toISOString(),
      origin: 'dashboard-data'
    };
  }

  async function uploadStoredFile(file, albumId = DEFAULT_ALBUM_ID) {
    const id = uid('file');
    const type = file.type || 'application/octet-stream';
    const thumbUrl = type.startsWith('image/') ? await createImageThumb(file).catch(() => '') : '';
    if (!client || !client.storage || typeof client.storage.from !== 'function') {
      throw new Error('Supabase browser client is not ready.');
    }

    const signed = await fileApi('upload-url', {
      id,
      bucket: FILE_BUCKET,
      name: file.name,
      type,
      size: file.size
    });
    const bucket = signed.bucket || FILE_BUCKET;
    const path = signed.path;
    const token = signed.token;
    if (!path || !token) throw new Error('Cloud upload token was not created.');

    const result = await client.storage.from(bucket).uploadToSignedUrl(path, token, file);
    if (result.error) throw result.error;

    return {
      id,
      name: file.name,
      type,
      size: file.size,
      albumId,
      storageBucket: bucket,
      storagePath: path,
      thumbUrl,
      createdAt: new Date().toISOString(),
      origin: 'supabase-storage'
    };
  }

  function createImageThumb(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const max = 420;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Thumbnail failed.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Thumbnail failed.'));
      };
      image.src = objectUrl;
    });
  }

  async function openFile(id) {
    const file = (state.photos || []).find((item) => item.id === id);
    if (!file) return;
    const fileAlbumId = file.albumId || DEFAULT_ALBUM_ID;
    const fileAlbum = (state.albums || []).find((item) => item.id === fileAlbumId);
    if (fileAlbum && fileAlbum.locked && !isAlbumUnlocked(fileAlbum)) {
      setNotice('Unlock this album first to view its files.');
      return;
    }

    revokeActiveFileUrl();
    ui.activeFileId = id;
    ui.activeFileUrl = fileUrl(file);
    ui.activeFileText = isTextFile(file) ? dataUrlToText(ui.activeFileUrl) : '';
    ui.activeFileLoading = Boolean(file.storagePath && !ui.activeFileUrl);
    ui.activeFileError = '';
    render();

    if (!file.storagePath || ui.activeFileUrl) return;

    try {
      const blob = await fetchStoredFile(file);
      const objectUrl = URL.createObjectURL(blob);
      ui.activeFileObjectUrl = objectUrl;
      ui.activeFileUrl = objectUrl;
      ui.activeFileText = isTextFile(file) ? await blob.text() : '';
      ui.activeFileLoading = false;
      render();
    } catch (error) {
      ui.activeFileLoading = false;
      ui.activeFileError = error.message || 'Could not open this file.';
      render();
    }
  }

  function closeFile() {
    revokeActiveFileUrl();
    ui.activeFileId = '';
    ui.activeFileUrl = '';
    ui.activeFileText = '';
    ui.activeFileLoading = false;
    ui.activeFileError = '';
    render();
  }

  async function fetchStoredFile(file) {
    if (!file.storagePath) throw new Error('No cloud file path found.');
    const signed = await fileApi('read-url', {
      bucket: file.storageBucket || FILE_BUCKET,
      path: file.storagePath
    });
    if (!signed.signedUrl) throw new Error('Could not create file link.');
    const response = await fetch(signed.signedUrl);
    if (!response.ok) throw new Error('Could not open this file.');
    return response.blob();
  }

  async function removeStoredFile(file) {
    if (!file?.storagePath) return;
    await fileApi('delete', {
      bucket: file.storageBucket || FILE_BUCKET,
      path: file.storagePath
    });
  }

  async function downloadFile(id) {
    const file = (state.photos || []).find((item) => item.id === id);
    if (!file) return;

    try {
      const source = fileUrl(file);
      if (source) {
        triggerDownload(source, file.name);
        return;
      }

      const blob = await fetchStoredFile(file);
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, file.name);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setNotice(error.message || 'Download failed.');
    }
  }

  function triggerDownload(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function deleteFile(id) {
    const file = (state.photos || []).find((item) => item.id === id);
    if (!file) return;
    if (!confirmDelete(file.name || 'this file')) return;

    try {
      await removeStoredFile(file);
    } catch (error) {
      setNotice(error.message || 'Could not remove cloud file.');
      return;
    }

    if (ui.activeFileId === id) closeFile();

    mutate((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== id)
    }));
    setNotice('File removed.');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hk-dashboard-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = mergeDashboard(JSON.parse(reader.result));
        scheduleSave();
        setNotice('Backup imported.');
      } catch {
        setNotice('Backup import failed.');
      }
    };
    reader.readAsText(file);
  }

  render();
  if (isDashboardUnlocked()) bootCloud();
})();
