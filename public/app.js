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
  const ONE_SIGNAL_PROMPT_STORAGE = 'hk-dashboard-onesignal-prompted-v1';
  const REMINDER_FLAGS = ['twoDays', 'oneDay', 'threeHours', 'startNow', 'completed'];
  const config = window.HK_CONFIG || {};
  const root = document.getElementById('root');

  let client = null;
  let session = null;
  let saveTimer = null;
  let syncTimer = null;
  let deferredRenderTimer = null;
  let clockTimer = null;
  let realtimeChannel = null;
  let cloudBooted = false;
  let oneSignalBooted = false;
  let oneSignalExternalId = '';
  let calendarDeepLinkHandled = false;
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
    editingNoteId: '',
    openBreakdownPickId: '',
    aiOpen: false,
    aiLoading: false
  };

  // Session-only chat memory. Never saved to localStorage or Supabase.
  let aiMessages = [
    {
      role: 'assistant',
      text: 'I am HK AI. I can manage your dashboard, open quick links, and pick stocks. Try "best stock to buy" for a weighted top pick, "rank my picks" for a full ranking, or "open YouTube". Chats are temporary — only dashboard changes are saved.'
    }
  ];

  const quickLinks = [
    ['Test Paper Generator', 'https://edu-test-ai-rho.vercel.app/', 'TP'],
    ['Stock Screener', 'https://nse-sentinelmax-msrfjdkwmksf6jama4jvmx.streamlit.app/', 'ST'],
    ['TradingView', 'https://in.tradingview.com/', 'TV'],
    ['GitHub', 'https://github.com/', 'GH'],
    ['YouTube', 'https://www.youtube.com/', 'YT'],
    ['ChatGPT', 'https://chatgpt.com/', 'AI']
  ];

  const quickLinkAliases = {
    youtube: 'YouTube',
    yt: 'YouTube',
    'stock screener': 'Stock Screener',
    screener: 'Stock Screener',
    stocks: 'Stock Screener',
    nse: 'Stock Screener',
    sentinel: 'Stock Screener',
    tradingview: 'TradingView',
    'trading view': 'TradingView',
    tv: 'TradingView',
    github: 'GitHub',
    gh: 'GitHub',
    chatgpt: 'ChatGPT',
    gpt: 'ChatGPT',
    chat: 'ChatGPT',
    'test paper': 'Test Paper Generator',
    'test paper generator': 'Test Paper Generator',
    edutest: 'Test Paper Generator',
    tp: 'Test Paper Generator'
  };

  function resolveQuickLink(query) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;

    const needle = raw.toLowerCase().replace(/^(open|launch|go to|visit)\s+/i, '').trim();
    const aliasLabel = quickLinkAliases[needle];
    if (aliasLabel) {
      const aliasLink = quickLinks.find(([label]) => label === aliasLabel);
      if (aliasLink) return { label: aliasLink[0], url: aliasLink[1] };
    }

    const direct = quickLinks.find(([label]) => label.toLowerCase() === needle);
    if (direct) return { label: direct[0], url: direct[1] };

    const fuzzy = quickLinks.find(([label]) => {
      const labelLower = label.toLowerCase();
      return labelLower.includes(needle) || needle.includes(labelLower);
    });
    if (fuzzy) return { label: fuzzy[0], url: fuzzy[1] };

    return null;
  }

  function openQuickLink(query) {
    const target = resolveQuickLink(query);
    if (!target) {
      return `Could not find "${query}". Say "list links" to see options: ${quickLinks.map(([label]) => label).join(', ')}.`;
    }
    window.open(target.url, '_blank', 'noopener,noreferrer');
    return `Opened ${target.label}.`;
  }

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
      eventHistory: [],
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
    const calendar = normalizeCalendarData(
      Array.isArray(data.events) ? data.events : defaults.events,
      Array.isArray(data.eventHistory) ? data.eventHistory : Array.isArray(data.completedHistory) ? data.completedHistory : defaults.eventHistory
    );
    return cleanSeedData({
      ...defaults,
      ...data,
      notes: Array.isArray(data.notes) ? data.notes : defaults.notes,
      tasks: Array.isArray(data.tasks) ? data.tasks : defaults.tasks,
      events: calendar.events,
      eventHistory: calendar.eventHistory,
      habits: Array.isArray(data.habits) ? data.habits : defaults.habits,
      picks: Array.isArray(data.picks) ? data.picks : defaults.picks,
      albums,
      photos,
      growthStartDate: data.growthStartDate || inferGrowthStartDate(data.habits) || defaults.growthStartDate,
      updatedAt: data.updatedAt || defaults.updatedAt
    });
  }

  function isEventCompleted(event) {
    return Boolean(event?.completed || event?.done);
  }

  function normalizeNotificationFlags(flags) {
    const input = flags && typeof flags === 'object' ? flags : {};
    return REMINDER_FLAGS.reduce((next, key) => {
      next[key] = Boolean(input[key]);
      return next;
    }, {});
  }

  function normalizeEvent(event) {
    const title = String(event?.title || '').trim();
    const date = isDateKey(event?.date) ? event.date : todayKey(1);
    return {
      id: event?.id || uid('event'),
      title: title || 'Untitled event',
      date,
      time: String(event?.time || ''),
      completed: isEventCompleted(event),
      done: isEventCompleted(event),
      notificationEnabled: event?.notificationEnabled !== false,
      notificationFlags: normalizeNotificationFlags(event?.notificationFlags),
      timeZone: String(event?.timeZone || config.REMINDER_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'),
      completedAt: event?.completedAt || '',
      createdAt: event?.createdAt || new Date().toISOString()
    };
  }

  function historyFromEvent(event) {
    const normalized = normalizeEvent(event);
    return {
      id: event?.historyId || `history-${normalized.id}`,
      originalEventId: normalized.id,
      title: normalized.title,
      date: normalized.date,
      time: normalized.time,
      completed: true,
      notificationEnabled: normalized.notificationEnabled,
      notificationFlags: normalizeNotificationFlags(normalized.notificationFlags),
      timeZone: normalized.timeZone,
      completedAt: normalized.completedAt || new Date().toISOString(),
      createdAt: normalized.createdAt
    };
  }

  function normalizeHistoryItem(item) {
    if (item?.originalEventId || item?.completedAt) {
      const originalEventId = String(item.originalEventId || item.id || uid('event'));
      return {
        id: item.id || `history-${originalEventId}`,
        originalEventId,
        title: String(item.title || 'Untitled event'),
        date: isDateKey(item.date) ? item.date : todayKey(),
        time: String(item.time || ''),
        completed: true,
        notificationEnabled: item?.notificationEnabled !== false,
        notificationFlags: normalizeNotificationFlags(item?.notificationFlags),
        timeZone: String(item?.timeZone || config.REMINDER_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'),
        completedAt: item.completedAt || new Date().toISOString(),
        createdAt: item.createdAt || item.originalCreatedAt || new Date().toISOString()
      };
    }
    return historyFromEvent(item);
  }

  function normalizeCalendarData(events, eventHistory) {
    const active = [];
    const history = new Map();

    (Array.isArray(eventHistory) ? eventHistory : []).forEach((item) => {
      const normalized = normalizeHistoryItem(item);
      history.set(normalized.originalEventId || normalized.id, normalized);
    });

    (Array.isArray(events) ? events : []).forEach((item) => {
      const normalized = normalizeEvent(item);
      if (normalized.completed) {
        const historyItem = historyFromEvent(normalized);
        history.set(historyItem.originalEventId, historyItem);
        return;
      }
      active.push(normalized);
    });

    return {
      events: active.sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`)),
      eventHistory: Array.from(history.values()).sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
    };
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
    return ['notes', 'tasks', 'events', 'eventHistory', 'habits', 'picks', 'photos'].some((key) => {
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

  function parseClientAiAction(message) {
    const text = String(message || '').trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    let match;

    if (/^(hi|hello|hey|yo|hola|good morning|good evening|good afternoon)\b/i.test(lower)) {
      return {
        action: 'chat',
        content: 'Hi! I can open links, add tasks/notes/habits, and manage your dashboard. Try "open YouTube", "add task buy milk", or "list links".'
      };
    }

    if (/^(list|show)\s+(my\s+)?notes?$/i.test(text) || /^what notes/i.test(lower)) {
      return { action: 'list_notes' };
    }
    if (/^(list|show)\s+(my\s+)?tasks?$/i.test(text) || /^what tasks/i.test(lower)) {
      return { action: 'list_tasks' };
    }
    if (/^(list|show)\s+(my\s+)?habits?$/i.test(text) || /^what habits/i.test(lower)) {
      return { action: 'list_habits' };
    }
    if (/^(list|show)\s+(my\s+)?events?$/i.test(text) || /^what events/i.test(lower)) {
      return { action: 'list_events' };
    }
    if (/^(list|show)\s+(my\s+)?picks?$/i.test(text) || /^what picks/i.test(lower)) {
      return { action: 'list_picks' };
    }

    if (/rank|sort|score|grade/.test(lower) && /pick|stock|share/i.test(lower)) {
      return { action: 'rank_picks' };
    }

    if (/(breakdown|why|explain|score breakdown)/i.test(lower) && /(pick|stock|[A-Z]{3,})/i.test(text)) {
      const symbolMatch = text.match(/\b([A-Z][A-Z0-9.&-]{1,15})\b/);
      return { action: 'pick_score_breakdown', title: symbolMatch ? symbolMatch[1] : '' };
    }

    if (/(best|top|which|recommend|suggest|should i buy|buy now|pick one|top pick|kill it|tell me (?:a|the)?\s*(?:best|top)|one stock)/i.test(lower) && /(stock|pick|share|buy|invest|trade|scalp|swing)/i.test(lower)) {
      return { action: 'recommend_pick' };
    }
    if (/what do i have|dashboard summary|list dashboard/i.test(lower)) {
      return { action: 'list_dashboard' };
    }
    if (/^list\s+links?$/i.test(text) || /^what (?:sites|links) can i open/i.test(lower)) {
      return { action: 'list_links' };
    }

    match = text.match(/^(?:open|launch|go to|visit)\s+(?:my\s+)?(.+)$/i);
    if (match) return { action: 'open_link', title: match[1].trim() };

    match = text.match(/^(?:check|tick)\s*(\d+)\s*box(?:es)?(?:\s*at)?\s*(?:for\s+)?(.+)$/i);
    if (match) return { action: 'check_habit', title: match[2].trim(), count: Number(match[1]) };

    match = text.match(/^add\s+(?:a\s+)?habit\s+(?:called\s+)?(.+?)(?:\s+and\s+(?:tick|check)\s*(\d+)\s*box(?:es)?)?$/i);
    if (match) {
      return {
        action: 'create_habit',
        title: match[1].trim(),
        count: match[2] ? Number(match[2]) : null
      };
    }

    match = text.match(/^add\s+(?:a\s+)?task\s*:?\s*(.+)$/i) || text.match(/^(?:remind me to|i have to)\s+(.+)$/i);
    if (match) return { action: 'create_task', title: match[1].trim() };

    match = text.match(/^tomorrow\s+(.+)$/i);
    if (match) return { action: 'create_task', title: match[1].trim(), date: 'tomorrow' };

    match = text.match(/^add\s+(?:a\s+)?(?:note|that)\s*:?\s*(.+)$/i) || text.match(/^(?:remember|don't forget)\s*:?\s*(.+)$/i);
    if (match) return { action: 'create_note', content: match[1].trim() };

    match = text.match(/^mark\s+(.+?)\s+done$/i);
    if (match) return { action: 'complete_task', title: match[1].trim() };

    return null;
  }

  async function aiApiRequest(body) {
    const response = await fetch(`${window.location.origin}/api/ai`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    const raw = await response.text();
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('AI service is temporarily unavailable.');
    }
    if (!response.ok) {
      throw new Error(payload.error || 'AI request failed.');
    }
    return payload;
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

  function dashboardNotificationExternalId() {
    return String(session?.user?.id || config.ONESIGNAL_EXTERNAL_ID || 'hk-dashboard').trim();
  }

  function oneSignalConfigured() {
    return Boolean(config.ONESIGNAL_APP_ID && 'Notification' in window && 'serviceWorker' in navigator);
  }

  function oneSignalPromptWasUsed() {
    try {
      return localStorage.getItem(ONE_SIGNAL_PROMPT_STORAGE) === 'yes';
    } catch {
      return true;
    }
  }

  function markOneSignalPromptUsed() {
    try {
      localStorage.setItem(ONE_SIGNAL_PROMPT_STORAGE, 'yes');
    } catch {
      /* Permission prompting is still safe without localStorage. */
    }
  }

  function pushOneSignalTask(task) {
    if (!oneSignalConfigured()) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(task);
  }

  function syncOneSignalIdentity() {
    if (!oneSignalConfigured()) return;
    const externalId = dashboardNotificationExternalId();
    if (!externalId || oneSignalExternalId === externalId) return;
    oneSignalExternalId = externalId;

    pushOneSignalTask(async (OneSignal) => {
      try {
        await OneSignal.login(externalId);
      } catch (error) {
        console.warn('OneSignal identity sync failed.', error);
      }
    });
  }

  function bootOneSignal(options = {}) {
    if (!oneSignalConfigured()) return;
    const requestPermission = Boolean(options.requestPermission);
    const forcePrompt = Boolean(options.forcePrompt);

    pushOneSignalTask(async (OneSignal) => {
      try {
        if (!oneSignalBooted) {
          oneSignalBooted = true;
          await OneSignal.init({
            appId: config.ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: 'OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/' },
            notifyButton: { enable: false },
            promptOptions: {
              slidedown: {
                prompts: [{ type: 'push', autoPrompt: false }]
              }
            }
          });
        }

        syncOneSignalIdentity();

        if (requestPermission && Notification.permission === 'default' && (forcePrompt || !oneSignalPromptWasUsed())) {
          markOneSignalPromptUsed();
          await OneSignal.Notifications.requestPermission();
        }
      } catch (error) {
        console.warn('OneSignal setup failed.', error);
      }
    });
  }

  function requestOneSignalPermission() {
    if (!oneSignalConfigured()) {
      setNotice('Add OneSignal env vars and deploy over HTTPS to enable push reminders.');
      return;
    }
    bootOneSignal({ requestPermission: true, forcePrompt: true });
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

  function isEditableElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function userIsDrafting() {
    return isEditableElement(document.activeElement);
  }

  function captureDraftState() {
    const drafts = {};
    [
      'quick-text',
      'note-text',
      'hk-ai-input',
      'event-title',
      'event-date',
      'event-time',
      'pick-symbol',
      'pick-bias',
      'pick-entry',
      'pick-target',
      'habit-name',
      'album-name',
      'album-password',
      'email'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el && 'value' in el) drafts[id] = el.value;
    });

    document.querySelectorAll('[data-note-body-input]').forEach((el) => {
      drafts[`note-body:${el.dataset.noteBodyInput}`] = el.value;
    });
    document.querySelectorAll('[data-note-title-input]').forEach((el) => {
      drafts[`note-title:${el.dataset.noteTitleInput}`] = el.value;
    });
    document.querySelectorAll('[data-note-code-lang]').forEach((el) => {
      drafts[`note-code-lang:${el.dataset.noteCodeLang}`] = el.value;
    });
    document.querySelectorAll('[data-note-code-input]').forEach((el) => {
      drafts[`note-code-input:${el.dataset.noteCodeInput}`] = el.value;
    });

    const active = document.activeElement;
    let focus = null;
    if (isEditableElement(active)) {
      focus = {
        id: active.id || '',
        noteBody: active.dataset?.noteBodyInput || '',
        noteTitle: active.dataset?.noteTitleInput || '',
        noteCodeLang: active.dataset?.noteCodeLang || '',
        noteCodeInput: active.dataset?.noteCodeInput || '',
        start: active.selectionStart,
        end: active.selectionEnd
      };
    }

    return { drafts, focus };
  }

  function restoreDraftState(snapshot) {
    if (!snapshot) return;

    Object.entries(snapshot.drafts || {}).forEach(([key, value]) => {
      if (!key.includes(':')) {
        const el = document.getElementById(key);
        if (el && 'value' in el) el.value = value;
        return;
      }

      const [kind, id] = key.split(':');
      const selectors = {
        'note-body': `[data-note-body-input="${id}"]`,
        'note-title': `[data-note-title-input="${id}"]`,
        'note-code-lang': `[data-note-code-lang="${id}"]`,
        'note-code-input': `[data-note-code-input="${id}"]`
      };
      const el = document.querySelector(selectors[kind] || '');
      if (el && 'value' in el) el.value = value;
    });

    const focus = snapshot.focus;
    if (!focus) return;

    let el = null;
    if (focus.id) el = document.getElementById(focus.id);
    else if (focus.noteBody) el = document.querySelector(`[data-note-body-input="${focus.noteBody}"]`);
    else if (focus.noteTitle) el = document.querySelector(`[data-note-title-input="${focus.noteTitle}"]`);
    else if (focus.noteCodeLang) el = document.querySelector(`[data-note-code-lang="${focus.noteCodeLang}"]`);
    else if (focus.noteCodeInput) el = document.querySelector(`[data-note-code-input="${focus.noteCodeInput}"]`);

    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && typeof focus.end === 'number' && el.setSelectionRange) {
      try {
        el.setSelectionRange(focus.start, focus.end);
      } catch {
        /* unsupported input types */
      }
    }
  }

  function dashboardFingerprint() {
    return JSON.stringify({
      notes: state.notes,
      tasks: state.tasks,
      events: state.events,
      eventHistory: state.eventHistory,
      habits: state.habits,
      picks: state.picks,
      photos: state.photos,
      albums: state.albums,
      notice,
      editingNoteId: ui.editingNoteId,
      selectedDate: ui.selectedDate,
      monthCursor: ui.monthCursor ? dateKey(ui.monthCursor) : '',
      pickFilter: ui.pickFilter
    });
  }

  function scheduleDeferredRender() {
    clearTimeout(deferredRenderTimer);
    deferredRenderTimer = setTimeout(() => {
      if (userIsDrafting()) {
        scheduleDeferredRender();
        return;
      }
      render();
    }, 1200);
  }

  function updateClockDisplay() {
    const clock = document.querySelector('.clock-card span');
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function startClockTicker() {
    if (clockTimer) return;
    updateClockDisplay();
    clockTimer = setInterval(updateClockDisplay, 30000);
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
      oneSignalExternalId = '';
      syncOneSignalIdentity();
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
    const before = dashboardFingerprint();

    if (session) {
      await loadCloud({ force, silent: true });
    } else {
      await loadServerState({ force, silent: true }).catch(() => {});
      if (client) await loadCloudPicks({ silent: true });
    }

    markSynced(session ? 'Cloud synced' : 'Picks synced');
    const after = dashboardFingerprint();

    if (!silent) {
      setNotice(session ? 'Latest cloud data synced.' : 'Latest stock picks synced.');
      return;
    }

    if (before === after) return;

    if (userIsDrafting()) {
      scheduleDeferredRender();
      return;
    }

    render();
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
      if (isEventCompleted(event)) return map;
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

  // Weighted scoring rubric (sums to 100).
  // - Trend 25 / Volume 20 / Relative Strength 15 / Momentum 15
  //   Sector 10 / Risk vs Reward 10 / News 5
  const STOCK_SCORE_WEIGHTS = [
    { key: 'trend', label: 'Trend', weight: 25 },
    { key: 'volume', label: 'Volume', weight: 20 },
    { key: 'relativeStrength', label: 'Relative Strength', weight: 15 },
    { key: 'momentum', label: 'Momentum', weight: 15 },
    { key: 'sector', label: 'Sector Strength', weight: 10 },
    { key: 'riskReward', label: 'Risk / Reward', weight: 10 },
    { key: 'news', label: 'News / Trigger', weight: 5 }
  ];

  const STOCK_SCORE_TOTAL_WEIGHT = STOCK_SCORE_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);

  function pickNumeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).replace(/[, %]/g, '').trim();
    if (!text) return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  }

  function pickNumberInRange(value, low, high) {
    const num = pickNumeric(value);
    if (num === null) return null;
    return Math.min(high, Math.max(low, num));
  }

  function scoreTrend(pick) {
    // Trend signal: setup text + bias + higher-highs phrasing.
    // Strong setups: Breakout Ready, Momentum Continuation, Trend Continuation, Stage 2.
    // Weak setups: Avoid, Breakdown, Weak.
    const setup = String(pick.setup || '').toLowerCase();
    const bias = String(pick.bias || '').toLowerCase();
    const notes = String(pick.notes || '').toLowerCase();
    const signals = [];

    let score = 55; // neutral baseline
    const positives = ['breakout ready', 'momentum continuation', 'trend continuation', 'stage 2 uptrend', 'pullback to support', 'higher highs', 'higher lows'];
    const negatives = ['avoid', 'breakdown', 'weak', 'downtrend', 'lower low', 'trend weakness', 'distribution'];

    positives.forEach((phrase) => {
      if (setup.includes(phrase) || notes.includes(phrase) || bias.includes(phrase)) {
        score += 10;
        signals.push(`positive: ${phrase}`);
      }
    });
    negatives.forEach((phrase) => {
      if (setup.includes(phrase) || notes.includes(phrase) || bias.includes(phrase)) {
        score -= 14;
        signals.push(`negative: ${phrase}`);
      }
    });

    if (bias === 'buy' || bias === 'long') score += 6;
    if (bias === 'sell' || bias === 'short') score -= 18;

    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreVolume(pick) {
    // Volume signal: explicit volume + setup text + delivery hints in notes.
    let score = 50;
    const signals = [];
    const volume = pickNumeric(pick.volume);
    if (volume !== null) {
      if (volume >= 500000) {
        score += 18;
        signals.push(`volume ≥ 500k (${volume})`);
      } else if (volume >= 100000) {
        score += 10;
        signals.push(`volume ≥ 100k (${volume})`);
      } else if (volume >= 25000) {
        score += 4;
      } else {
        score -= 6;
        signals.push(`thin volume (${volume})`);
      }
    } else {
      signals.push('volume unknown');
    }
    const notes = String(pick.notes || '').toLowerCase();
    const setup = String(pick.setup || '').toLowerCase();
    if (/volume confirm|volume support|strong volume|heavy volume|institutional volume/i.test(notes + ' ' + setup)) {
      score += 12;
      signals.push('volume confirmation in notes');
    }
    if (/weak volume|low volume|dry up|distribution/i.test(notes)) {
      score -= 12;
      signals.push('weak volume note');
    }
    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreRelativeStrength(pick) {
    // We don't have index data here, so we infer RS from bias + setup + notes.
    let score = 55;
    const signals = [];
    const text = (String(pick.setup || '') + ' ' + String(pick.notes || '') + ' ' + String(pick.bias || '')).toLowerCase();
    if (/outperform|relative strength|strong relative|leading|rs >|rs above/i.test(text)) {
      score += 22;
      signals.push('outperforming note');
    }
    if (/laggard|underperform|weak relative|rs <|rs below/i.test(text)) {
      score -= 22;
      signals.push('laggard note');
    }
    if (/sector leader|sector top|sector outperform/i.test(text)) {
      score += 10;
    }
    if (pick.source === 'AI') score += 4;
    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreMomentum(pick) {
    // RSI sweet spot 55–68, ADX > 25, MACD bullish, not overbought (>75).
    let score = 60;
    const signals = [];

    const rsi = pickNumberInRange(pick.rsi, 0, 100);
    if (rsi !== null) {
      if (rsi >= 75) {
        score -= 26;
        signals.push(`RSI overbought (${rsi.toFixed(1)})`);
      } else if (rsi >= 68) {
        score -= 8;
        signals.push(`RSI high (${rsi.toFixed(1)})`);
      } else if (rsi >= 55) {
        score += 18;
        signals.push(`RSI bullish (${rsi.toFixed(1)})`);
      } else if (rsi >= 45) {
        score += 6;
      } else if (rsi >= 30) {
        score -= 8;
        signals.push(`RSI weak (${rsi.toFixed(1)})`);
      } else {
        score -= 22;
        signals.push(`RSI oversold/weak (${rsi.toFixed(1)})`);
      }
    }

    const text = (String(pick.notes || '') + ' ' + String(pick.setup || '')).toLowerCase();
    if (/macd bullish|macd crossover|adx > 25|adx above|strong adx|momentum build/i.test(text)) {
      score += 8;
      signals.push('MACD/ADX confirmation');
    }
    if (/macd bearish|macd divergence|adx < 20|weak adx|momentum fade/i.test(text)) {
      score -= 14;
      signals.push('MACD/ADX warning');
    }
    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreSector(pick) {
    // No sector index data on the pick; use setup/notes hints.
    let score = 55;
    const signals = [];
    const text = (String(pick.setup || '') + ' ' + String(pick.notes || '')).toLowerCase();
    if (/sector strong|sector bullish|sector outperforming|sector leader|sector momentum/i.test(text)) {
      score += 22;
      signals.push('strong sector note');
    }
    if (/sector weak|sector laggard|sector underperform/i.test(text)) {
      score -= 22;
      signals.push('weak sector note');
    }
    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreRiskReward(pick) {
    // R/R: target >= 2 × risk is preferred. Entry / stop / target are the inputs.
    let score = 50;
    const signals = [];
    const entry = pickNumeric(pick.entry);
    const target = pickNumeric(pick.target);
    const stop = pickNumeric(pick.stop);
    const riskRaw = pickNumeric(pick.risk);

    let ratio = null;
    if (entry && target && stop) {
      const reward = Math.abs(target - entry);
      const riskAmt = Math.abs(entry - stop);
      if (riskAmt > 0) {
        ratio = reward / riskAmt;
        signals.push(`R:R = ${ratio.toFixed(2)}:1`);
      }
    } else if (riskRaw && target && entry) {
      // `pick.risk` is sometimes a percentage risk score (0–10).
      const reward = Math.abs(target - entry) / Math.max(entry, 1) * 100;
      if (riskRaw > 0) {
        ratio = reward / riskRaw;
        signals.push(`R:R ≈ ${ratio.toFixed(2)}:1 (from risk %)`);
      }
    }

    if (ratio !== null) {
      if (ratio >= 3) {
        score += 32;
        signals.push('excellent R:R (≥ 3:1)');
      } else if (ratio >= 2) {
        score += 18;
        signals.push('good R:R (≥ 2:1)');
      } else if (ratio >= 1.5) {
        score += 4;
      } else if (ratio >= 1) {
        score -= 12;
        signals.push('marginal R:R');
      } else {
        score -= 28;
        signals.push('poor R:R (< 1:1)');
      }
    } else {
      signals.push('R:R could not be computed (need entry, stop, target)');
      score -= 4;
    }

    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  function scoreNews(pick) {
    // Trigger: positive wording in notes / warnings.
    let score = 55;
    const signals = [];
    const positives = [
      'big order', 'order win', 'contract win', 'earnings beat', 'beat estimate',
      'government policy', 'policy boost', 'breakout after consolidation',
      'upgrade', 'rating upgrade', 'buy rating', 'block deal'
    ];
    const negatives = [
      'earnings miss', 'miss estimate', 'guidance cut', 'downgrade', 'rating cut',
      'investigation', 'penalty', 'fraud', 'exit', 'plant shutdown', 'strike',
      'weak management', 'pledging', 'regulatory action', 'tax hike', 'import duty'
    ];
    const text = (String(pick.notes || '') + ' ' + String(pick.warnings || '')).toLowerCase();
    positives.forEach((phrase) => {
      if (text.includes(phrase)) {
        score += 12;
        signals.push(`positive: ${phrase}`);
      }
    });
    negatives.forEach((phrase) => {
      if (text.includes(phrase)) {
        score -= 18;
        signals.push(`negative: ${phrase}`);
      }
    });
    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  const STOCK_SCORERS = {
    trend: scoreTrend,
    volume: scoreVolume,
    relativeStrength: scoreRelativeStrength,
    momentum: scoreMomentum,
    sector: scoreSector,
    riskReward: scoreRiskReward,
    news: scoreNews
  };

  function scoreStockPick(pick) {
    const breakdown = STOCK_SCORE_WEIGHTS.map(({ key, label, weight }) => {
      const scorer = STOCK_SCORERS[key];
      const result = scorer ? scorer(pick) : { score: 0, signals: [] };
      const contribution = (result.score * weight) / STOCK_SCORE_TOTAL_WEIGHT;
      return {
        key,
        label,
        weight,
        score: Math.round(result.score),
        contribution: Number(contribution.toFixed(2)),
        signals: result.signals || []
      };
    });
    const total = breakdown.reduce((sum, item) => sum + item.contribution, 0);
    return {
      pick,
      total: Math.round(total * 10) / 10,
      breakdown
    };
  }

  function scoreAllStockPicks(picks) {
    const scored = (Array.isArray(picks) ? picks : [])
      .map((pick) => scoreStockPick(pick))
      .filter((entry) => entry.pick && entry.pick.symbol);
    scored.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return String(a.pick.symbol).localeCompare(String(b.pick.symbol));
    });
    return scored;
  }

  function formatStockScoreBreakdownLine(entry) {
    const signals = entry.breakdown
      .flatMap((item) => item.signals.slice(0, 1))
      .filter(Boolean);
    const signalText = signals.length ? ` — ${signals.join(' · ')}` : '';
    return `${entry.pick.symbol} (${entry.pick.bias || 'Watch'}) → ${entry.total}/100${signalText}`;
  }

  function buildStockScoreBreakdownMessage(entry) {
    if (!entry) return 'No stock picks available to rank.';
    const lines = [
      `🏆 ${entry.pick.symbol} — ${entry.total}/100 (${entry.pick.bias || 'Watch'})`,
      `Entry ${entry.pick.entry || '—'} · Target ${entry.pick.target || '—'} · Stop ${entry.pick.stop || '—'}`
    ];
    entry.breakdown.forEach((item) => {
      lines.push(` • ${item.label} (${item.weight}%): ${item.score}/100 → +${item.contribution.toFixed(1)}`);
    });
    return lines.join('\n');
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
      .filter((event) => event.date === ui.selectedDate && !isEventCompleted(event))
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const eventsHtml = selectedEvents.length
      ? selectedEvents
          .map((event) => {
            const notifyOn = event.notificationEnabled !== false;
            return `<div class="list-item event-item">
              <span class="icon">CA</span>
              <div>
                <strong>${escapeHtml(event.title)}</strong>
                <span>${escapeHtml(event.time || 'All day')} · Notifications ${notifyOn ? 'on' : 'off'}</span>
              </div>
              <div class="item-actions">
                <button type="button" class="${notifyOn ? 'notify-button active' : 'notify-button'}" data-event-notify="${escapeHtml(event.id)}">${notifyOn ? 'Notify On' : 'Notify Off'}</button>
                <button type="button" class="finish-button" data-event-finish="${escapeHtml(event.id)}">Finish</button>
                <button type="button" class="remove-button" data-event-delete="${escapeHtml(event.id)}">Remove</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="empty">No events</p>';

    const historyHtml = state.eventHistory.length
      ? state.eventHistory
          .slice(0, 8)
          .map((event) => {
            const when = [formatDisplayDate(event.date), event.time || 'All day'].filter(Boolean).join(' · ');
            return `<div class="list-item event-item history-item">
              <span class="icon">OK</span>
              <div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(when)}</span></div>
              <small>${escapeHtml(new Date(event.completedAt || event.createdAt || Date.now()).toLocaleDateString())}</small>
            </div>`;
          })
          .join('')
      : '<p class="empty">No completed events</p>';

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
        <label class="checkbox-line notify-line"><input id="event-notify" type="checkbox" checked />Notify</label>
        <button type="button" id="add-event">Add</button>
      </div>
      <div class="list-block"><h3>${formatDisplayDate(ui.selectedDate)}</h3>${eventsHtml}</div>
      <div class="list-block history-block"><h3>Completed History</h3>${historyHtml}</div>
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
            const noteActions = isEditing
              ? `<div class="note-top-actions">
                  <button type="button" class="remove-button" data-note-cancel="${escapeHtml(note.id)}">Cancel</button>
                  <button type="button" class="save-button" data-note-save="${escapeHtml(note.id)}">Save</button>
                </div>`
              : `<div class="note-top-actions">
                  <button type="button" class="copy-button" data-note-copy="${escapeHtml(note.id)}">Copy</button>
                  <button type="button" class="edit-button" data-note-edit="${escapeHtml(note.id)}">Edit</button>
                  <button type="button" class="remove-button" data-note-delete="${escapeHtml(note.id)}">Remove</button>
                </div>`;
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
                          <input data-note-code-lang="${blockId}" value="${escapeHtml(lang)}" placeholder="language (js, py, sql...)" maxlength="24" />
                          <button type="button" class="remove-button" data-note-code-remove="${blockId}">Remove</button>
                        </div>
                        <textarea wrap="soft" data-note-code-input="${blockId}" placeholder="Paste your code here...">${escapeHtml(content)}</textarea>
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
            return `<div class="note-card ${isEditing ? 'editing' : ''}">
              <div class="card-title-row">
                ${titleField}
                ${noteActions}
              </div>
              ${bodyField}
              ${codeBlocksHtml}
              ${addCodeRow}
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
    const scored = scoreAllStockPicks(picks);
    const scoredMap = new Map(scored.map((entry) => [entry.pick.id, entry]));
    const picksHtml = picks.length
      ? picks
          .slice(0, 10)
          .map((pick) => {
            const score = scoredMap.get(pick.id);
            const weightedScore = score ? score.total : null;
            const weightedScoreLabel = weightedScore !== null ? `${Math.round(weightedScore)}/100` : '—';
            const weightClass = weightedScore === null
              ? ''
              : weightedScore >= 75 ? 'score-strong'
              : weightedScore >= 60 ? 'score-okay'
              : 'score-weak';
            const isOpen = ui.openBreakdownPickId === pick.id;
            const breakdownHtml = score && isOpen
              ? `<div class="pick-breakdown">
                  <p class="pick-breakdown-title">Weighted score (Trend 25 / Volume 20 / RS 15 / Momentum 15 / Sector 10 / R:R 10 / News 5)</p>
                  <ul>
                    ${score.breakdown.map((item) => `
                      <li>
                        <span class="bd-label">${escapeHtml(item.label)}</span>
                        <span class="bd-bar"><span class="bd-fill" style="width:${item.score}%; background:${item.score >= 70 ? '#63d297' : item.score >= 50 ? '#49d7e9' : '#ff5c7a'}"></span></span>
                        <span class="bd-score">${item.score}/100 · ×${item.weight}% → +${item.contribution.toFixed(1)}</span>
                      </li>
                    `).join('')}
                  </ul>
                </div>`
              : '';
            const rows = renderPickRows([
              ['Price', pick.price],
              ['Entry', pick.entry],
              ['Target 1', pick.target],
              ['Target 2', pick.target2],
              ['Stop', pick.stop],
              ['Source score', formatPickScore(pick.confidence)],
              ['Risk', pick.risk],
              ['Timing', pick.timing],
              ['Setup', pick.setup],
              ['Volume', pick.volume],
              ['RSI', pick.rsi]
            ]);
            return `<div class="pick-card">
              <div><strong>${escapeHtml(pick.symbol)}</strong><span>${escapeHtml(pick.source)}</span></div>
              <p>${escapeHtml(pick.bias || 'Watch')}</p>
              <div class="pick-weighted-score">
                <span class="weighted-label">Weighted</span>
                <span class="weighted-value ${weightClass}">${escapeHtml(weightedScoreLabel)}</span>
                <button type="button" class="breakdown-toggle" data-pick-breakdown="${escapeHtml(pick.id)}">${isOpen ? 'Hide' : 'Why?'}</button>
              </div>
              <dl>${rows || '<dt>Status</dt><dd>Waiting for detail sync</dd>'}</dl>
              ${breakdownHtml}
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
        <div><p class="eyebrow">Tomorrow's Picks</p><h2>${picks.length} stocks · top ${scored[0]?.pick.symbol || '—'} (${scored[0] ? Math.round(scored[0].total) : '—'}/100)</h2></div>
        <div class="button-row">
          <button type="button" id="ai-recommend-pick">Best pick</button>
          <button type="button" id="ai-rank-picks">Rank all</button>
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

  function calcStorageData() {
    // ── Real localStorage usage ────────────────────────────────
    let localStorageUsed = 0;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '';
      localStorageUsed = new Blob([raw]).size;
    } catch { /* unavailable */ }

    // ── Per-category byte estimates ────────────────────────────
    function jsonBytes(value) {
      try { return new Blob([JSON.stringify(value)]).size; } catch { return 0; }
    }

    const notesBytes   = jsonBytes(state.notes);
    const tasksBytes   = jsonBytes(state.tasks);
    const calBytes     = jsonBytes(state.events) + jsonBytes(state.eventHistory);
    const habitsBytes  = jsonBytes(state.habits);
    const picksBytes   = jsonBytes(state.picks);

    // Gallery: use stored size field when available (real file size), else estimate from dataUrl
    const galleryBytes = (state.photos || []).reduce((sum, file) => {
      if (Number(file.size) > 0) return sum + Number(file.size);
      const url = file.dataUrl || file.url || '';
      if (url.startsWith('data:')) return sum + Math.round((url.length * 3) / 4);
      return sum;
    }, 0);

    const totalTracked = notesBytes + tasksBytes + calBytes + habitsBytes + picksBytes + galleryBytes;

    // LocalStorage quota is typically 5 MB (some browsers 10 MB)
    const LS_QUOTA = 5 * 1024 * 1024;
    const lsUsedPct = Math.min((localStorageUsed / LS_QUOTA) * 100, 100);

    return {
      localStorageUsed,
      lsUsedPct,
      LS_QUOTA,
      totalTracked,
      categories: [
        { key: 'notes',    label: 'Notes',          icon: '📝', bytes: notesBytes,  count: state.notes.length,               color: '#49d7e9' },
        { key: 'tasks',    label: 'Tasks',           icon: '✅', bytes: tasksBytes,  count: state.tasks.length,               color: '#f2b84b' },
        { key: 'calendar', label: 'Calendar',        icon: '📅', bytes: calBytes,    count: state.events.length + state.eventHistory.length, color: '#63d297' },
        { key: 'habits',   label: 'Habits',          icon: '🔥', bytes: habitsBytes, count: state.habits.length,              color: '#ff5c7a' },
        { key: 'gallery',  label: 'Gallery & Files', icon: '🖼️', bytes: galleryBytes,count: (state.photos || []).length,      color: '#8b5cf6' },
        { key: 'picks',    label: 'Stock Picks',     icon: '📈', bytes: picksBytes,  count: state.picks.length,               color: '#81e6d9' }
      ]
    };
  }

  function renderStoragePanel() {
    const data = calcStorageData();
    const { localStorageUsed, lsUsedPct, LS_QUOTA, totalTracked, categories } = data;

    const circumference = 2 * Math.PI * 44; // r=44 on viewBox 110
    const filledArc = (lsUsedPct / 100) * circumference;

    // Donut colour: green→amber→rose based on usage
    const donutColor = lsUsedPct < 60 ? '#49d7e9' : lsUsedPct < 85 ? '#f2b84b' : '#ff5c7a';

    const catCardsHtml = categories.map((cat) => {
      const pct = totalTracked > 0 ? Math.min((cat.bytes / totalTracked) * 100, 100) : 0;
      return `<div class="storage-cat-card">
        <div class="storage-cat-header">
          <div class="storage-cat-icon ${cat.key}">${cat.icon}</div>
          <div class="storage-cat-info">
            <strong>${escapeHtml(cat.label)}</strong>
            <span>${cat.count} item${cat.count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="storage-cat-bar-wrap">
          <div class="storage-cat-bar ${cat.key}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="storage-cat-footer">
          <span class="storage-cat-size">${formatBytes(cat.bytes)}</span>
          <span class="storage-cat-count">${pct.toFixed(1)}% of data</span>
        </div>
      </div>`;
    }).join('');

    const breakdownHtml = [...categories]
      .sort((a, b) => b.bytes - a.bytes)
      .map((cat) => {
        const pct = totalTracked > 0 ? Math.min((cat.bytes / totalTracked) * 100, 100) : 0;
        return `<div class="storage-breakdown-row">
          <div class="storage-breakdown-dot" style="background:${cat.color}"></div>
          <span class="storage-breakdown-label">${escapeHtml(cat.label)}</span>
          <div class="storage-breakdown-bar-cell">
            <div class="storage-breakdown-bar-fill" style="width:${pct.toFixed(1)}%;background:${cat.color}"></div>
          </div>
          <span class="storage-breakdown-size">${formatBytes(cat.bytes)}</span>
        </div>`;
      }).join('');

    const statusColor = lsUsedPct < 60 ? '#63d297' : lsUsedPct < 85 ? '#f2b84b' : '#ff5c7a';
    const statusLabel = lsUsedPct < 60 ? 'Healthy' : lsUsedPct < 85 ? 'Getting Full' : 'Nearly Full';

    return `<article class="panel storage-panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">Storage Management</p>
          <h2>Total Storage · ${formatBytes(localStorageUsed)} used</h2>
        </div>
        <span class="icon large" style="color:${statusColor};border-color:${statusColor}40;background:${statusColor}14">ST</span>
      </header>

      <div class="storage-overview">
        <div class="storage-donut-wrap">
          <svg class="storage-donut" width="110" height="110" viewBox="0 0 110 110">
            <circle class="storage-donut-bg" cx="55" cy="55" r="44"/>
            <circle class="storage-donut-fill" cx="55" cy="55" r="44"
              stroke="${donutColor}"
              stroke-dasharray="${filledArc.toFixed(1)} ${circumference.toFixed(1)}"
            />
          </svg>
          <div class="storage-donut-label">
            <strong>${lsUsedPct.toFixed(0)}%</strong>
            <small>${statusLabel}</small>
          </div>
        </div>

        <div class="storage-overview-text">
          <h3>Browser Storage (localStorage)</h3>
          <p>Dashboard data, notes, tasks, habits and small files are saved locally in your browser.</p>
          <div class="storage-total-bar">
            <div class="storage-total-bar-fill" style="width:${lsUsedPct.toFixed(1)}%"></div>
          </div>
          <div class="storage-total-meta">
            <span>${formatBytes(localStorageUsed)} used</span>
            <span>${formatBytes(LS_QUOTA - localStorageUsed)} free of ${formatBytes(LS_QUOTA)}</span>
          </div>
        </div>
      </div>

      <div class="storage-categories">${catCardsHtml}</div>

      <div class="storage-breakdown-list">
        <h3>Storage Breakdown</h3>
        ${breakdownHtml}
      </div>

      <div class="storage-ls-info">
        <span class="icon">DB</span>
        <span>Dashboard data is also cloud-synced when signed in. Gallery files &gt;1 MB are stored in Supabase Storage — they don't count against your 5 MB browser quota.</span>
      </div>
    </article>`;
  }

  function renderAccount() {
    const cloudReady = Boolean(client);
    const authHtml = cloudReady
      ? session
        ? `<div class="account-box">
            <div><p>Signed in as ${escapeHtml(session.user.email)}</p><small>${escapeHtml(syncText)}</small></div>
            <div class="button-row"><button type="button" id="sync-now">Sync now</button><button type="button" id="purge-orphans">Purge orphan files</button><button type="button" id="sign-out">Sign out</button></div>
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
        <h2>To know the pass, talk to Hritvik (Developer)</h2>
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

  function normalizeAiPriority(value) {
    const raw = String(value || 'Normal').trim().toLowerCase();
    if (raw === 'high') return 'High';
    if (raw === 'low') return 'Low';
    return 'Normal';
  }

  function resolveAiDate(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (isDateKey(raw)) return raw;

    const lower = raw.toLowerCase();
    const now = new Date();

    if (lower === 'today') return todayKey();
    if (lower === 'tomorrow') return todayKey(1);
    if (lower === 'next week') return todayKey(7);

    const weekdayMatch = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
    if (weekdayMatch) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const target = days.indexOf(weekdayMatch[1]);
      const date = new Date(now);
      let delta = (target - date.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      date.setDate(date.getDate() + delta);
      return dateKey(date);
    }

    const dmy = lower.match(/^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/);
    if (dmy) {
      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const monthKey = dmy[2].slice(0, 3);
      const month = months[monthKey];
      if (month !== undefined) {
        const year = Number(dmy[3]) || now.getFullYear();
        const day = Number(dmy[1]);
        const date = new Date(year, month, day);
        if (!Number.isNaN(date.getTime())) return dateKey(date);
      }
    }

    return raw;
  }

  function resolveAiTime(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{2}:\d{2}$/.test(raw)) return raw;

    const match = raw.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match) return raw;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3];

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function splitAiLines(value) {
    return String(value || '')
      .split(/\n+/)
      .flatMap((line) => line.split(/[,;]+/))
      .map((line) => line.replace(/^[-*•\d.)]+\s*/, '').trim())
      .filter(Boolean);
  }

  function findNote(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.notes.find((note) => note.id === query) ||
      state.notes.find((note) => String(note.title || '').toLowerCase().includes(needle)) ||
      state.notes.find((note) => String(note.body || '').toLowerCase().includes(needle))
    );
  }

  function findTask(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.tasks.find((task) => task.id === query) ||
      state.tasks.find((task) => String(task.text || '').toLowerCase().includes(needle))
    );
  }

  function findEvent(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.events.find((event) => event.id === query) ||
      state.events.find((event) => String(event.title || '').toLowerCase().includes(needle))
    );
  }

  function findHabit(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.habits.find((habit) => habit.id === query) ||
      state.habits.find((habit) => String(habit.name || '').toLowerCase().includes(needle))
    );
  }

  function findPick(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.picks.find((pick) => pick.id === query) ||
      state.picks.find((pick) => String(pick.symbol || '').toLowerCase().includes(needle))
    );
  }

  function findAlbum(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    return (
      state.albums.find((album) => album.id === query) ||
      state.albums.find((album) => String(album.name || '').toLowerCase().includes(needle))
    );
  }

  function habitGridDays(habit, count = 30) {
    const start = habitStartKey(habit) || growthStartKey();
    return Array.from({ length: count }, (_, index) => addDaysKey(start, index));
  }

  function parseHabitCheckCount(payload) {
    const sources = [payload.count, payload.description, payload.content, payload.status];
    for (const source of sources) {
      if (source == null || source === '') continue;
      const raw = String(source).trim();
      const patterns = [
        /(\d+)\s*boxes?/i,
        /tick\s*(\d+)/i,
        /check\s*(\d+)/i,
        /(?:box|day)\s*(?:at|#)?\s*(\d+)/i,
        /^(\d+)$/
      ];
      for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (match) {
          const value = Number(match[1]);
          if (value >= 1 && value <= 30) return value;
        }
      }
    }
    return 0;
  }

  function resolveHabitCheckDays(payload, habit) {
    const raw = String(payload.description || payload.content || '').trim();
    const slotMatch = raw.match(/(?:box|day)\s*(?:at|#)?\s*(\d+)/i);
    if (slotMatch) {
      const slot = Number(slotMatch[1]);
      const days = habitGridDays(habit);
      if (slot >= 1 && slot <= 30) return [days[slot - 1]];
    }

    const count = parseHabitCheckCount(payload);
    if (count > 0) return habitGridDays(habit, count);

    const date = resolveAiDate(payload.date);
    if (date) return [date];

    return [todayKey()];
  }

  function applyHabitChecks(checks, days, checked) {
    const next = { ...(checks || {}) };
    days.forEach((day) => {
      if (checked) next[day] = true;
      else delete next[day];
    });
    return next;
  }

  function buildInitialHabitChecks(startDate, count) {
    if (!count) return {};
    const checks = {};
    for (let index = 0; index < Math.min(count, 30); index += 1) {
      checks[addDaysKey(startDate, index)] = true;
    }
    return checks;
  }

  function habitProgress(habit) {
    return Object.values(habit.checks || {}).filter(Boolean).length;
  }

  function buildAiContext() {
    const openTasks = state.tasks.filter((task) => !task.done).length;
    return {
      today: todayKey(),
      notes: state.notes.slice(0, 30).map((note) => ({
        id: note.id,
        title: note.title || note.body?.split('\n')[0] || 'Untitled'
      })),
      tasks: state.tasks.slice(0, 30).map((task) => ({
        id: task.id,
        text: task.text,
        done: Boolean(task.done),
        dueDate: task.dueDate || '',
        priority: task.priority || 'Normal'
      })),
      events: state.events.slice(0, 30).map((event) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        time: event.time || '',
        done: Boolean(event.done)
      })),
      habits: state.habits.slice(0, 30).map((habit) => ({
        id: habit.id,
        name: habit.name,
        progress: `${habitProgress(habit)}/30`,
        startDate: habitStartKey(habit) || habit.startDate || ''
      })),
      picks: state.picks.slice(0, 30).map((pick) => ({
        id: pick.id,
        symbol: pick.symbol,
        source: pick.source,
        bias: pick.bias || '',
        entry: pick.entry || '',
        target: pick.target || ''
      })),
      albums: (state.albums || []).slice(0, 20).map((album) => ({
        id: album.id,
        name: album.name,
        locked: Boolean(album.locked),
        fileCount: (state.photos || []).filter((file) => (file.albumId || DEFAULT_ALBUM_ID) === album.id).length
      })),
      files: (state.photos || []).slice(0, 20).map((file) => ({
        id: file.id,
        name: file.name,
        albumId: file.albumId || DEFAULT_ALBUM_ID,
        kind: fileKind(file)
      })),
      summary: {
        notes: state.notes.length,
        openTasks,
        tasks: state.tasks.length,
        events: state.events.length,
        habits: state.habits.length,
        picks: state.picks.length,
        albums: (state.albums || []).length,
        files: (state.photos || []).length
      },
      links: quickLinks.map(([name, url]) => ({ name, url }))
    };
  }

  function aiCreateNote(payload) {
    const body = String(payload.content || payload.description || payload.title || '').trim();
    if (!body) return 'Note content is missing.';
    const title = String(payload.title || body.split('\n')[0]).slice(0, 60);

    mutate((current) => ({
      ...current,
      notes: [
        {
          id: uid('note'),
          title,
          body,
          pinned: false,
          createdAt: new Date().toISOString()
        },
        ...current.notes
      ]
    }));
    return payload.success_message || 'Note created.';
  }

  function aiCreateTask(payload) {
    const lines = splitAiLines(payload.content || payload.title);
    const titles = lines.length ? lines : [String(payload.title || '').trim()].filter(Boolean);
    if (!titles.length) return 'Task title is missing.';

    const dueDate = resolveAiDate(payload.date);
    const priority = normalizeAiPriority(payload.priority);

    mutate((current) => ({
      ...current,
      tasks: [
        ...titles.map((text) => ({
          id: uid('task'),
          text,
          done: false,
          dueDate,
          priority,
          createdAt: new Date().toISOString()
        })),
        ...current.tasks
      ]
    }));

    return payload.success_message || (titles.length > 1 ? `${titles.length} tasks created.` : 'Task created.');
  }

  function aiCreateEvent(payload) {
    const title = String(payload.title || payload.content || '').trim();
    if (!title) return 'Event title is missing.';

    const date = resolveAiDate(payload.date) || ui.selectedDate || todayKey(1);
    const time = resolveAiTime(payload.time);

    mutate((current) => ({
      ...current,
      events: [
        ...current.events,
        {
          id: uid('event'),
          title,
          date,
          time,
          completed: false,
          done: false,
          notificationEnabled: true,
          notificationFlags: normalizeNotificationFlags(),
          timeZone: config.REMINDER_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          createdAt: new Date().toISOString()
        }
      ]
    }));
    ui.selectedDate = date;
    return payload.success_message || 'Calendar event created.';
  }

  function executeAiAction(payload) {
    if (!payload || typeof payload !== 'object') return 'I could not understand that request.';

    const action = String(payload.action || '').trim().toLowerCase();

    if (action === 'chat') {
      return String(payload.content || payload.success_message || 'Done.');
    }

    if (action === 'clarification') {
      return String(payload.question || 'Should I save this as a note, task, or calendar event?');
    }

    if (action === 'open_link' || action === 'open') {
      const message = openQuickLink(payload.title || payload.content || payload.description);
      return payload.success_message || message;
    }

    if (action === 'list_links') {
      return quickLinks.map(([label], index) => `${index + 1}. ${label}`).join('\n');
    }

    if (action === 'create_note') return aiCreateNote(payload);

    if (action === 'update_note') {
      const note = findNote(payload.id || payload.title);
      if (!note) return 'Could not find that note.';
      const body = String(payload.content || payload.description || note.body || '').trim();
      const title = String(payload.title || body.split('\n')[0] || note.title).slice(0, 60);
      mutate((current) => ({
        ...current,
        notes: current.notes.map((item) =>
          item.id === note.id
            ? { ...item, title, body, updatedAt: new Date().toISOString() }
            : item
        )
      }));
      return payload.success_message || 'Note updated.';
    }

    if (action === 'delete_note') {
      const note = findNote(payload.id || payload.title);
      if (!note) return 'Could not find that note.';
      if (ui.editingNoteId === note.id) ui.editingNoteId = '';
      mutate((current) => ({
        ...current,
        notes: current.notes.filter((item) => item.id !== note.id)
      }));
      return payload.success_message || 'Note removed.';
    }

    if (action === 'list_notes') {
      if (!state.notes.length) return 'You have no notes yet.';
      return state.notes
        .slice(0, 12)
        .map((note, index) => `${index + 1}. ${note.title || 'Untitled'}`)
        .join('\n');
    }

    if (action === 'create_task') return aiCreateTask(payload);

    if (action === 'update_task') {
      const task = findTask(payload.id || payload.title);
      if (!task) return 'Could not find that task.';
      const text = String(payload.title || payload.content || task.text).trim();
      mutate((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                text,
                dueDate: resolveAiDate(payload.date) || item.dueDate,
                priority: normalizeAiPriority(payload.priority || item.priority)
              }
            : item
        )
      }));
      return payload.success_message || 'Task updated.';
    }

    if (action === 'complete_task') {
      const task = findTask(payload.id || payload.title);
      if (!task) return 'Could not find that task.';
      mutate((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id
            ? { ...item, done: true, completedAt: new Date().toISOString() }
            : item
        )
      }));
      return payload.success_message || 'Task completed.';
    }

    if (action === 'delete_task') {
      const task = findTask(payload.id || payload.title);
      if (!task) return 'Could not find that task.';
      mutate((current) => ({
        ...current,
        tasks: current.tasks.filter((item) => item.id !== task.id)
      }));
      return payload.success_message || 'Task removed.';
    }

    if (action === 'list_tasks') {
      const open = state.tasks.filter((task) => !task.done);
      if (!open.length) return 'You have no open tasks.';
      return open
        .slice(0, 12)
        .map((task, index) => `${index + 1}. ${task.text}${task.dueDate ? ` (${task.dueDate})` : ''}`)
        .join('\n');
    }

    if (action === 'create_event') return aiCreateEvent(payload);

    if (action === 'update_event') {
      const event = findEvent(payload.id || payload.title);
      if (!event) return 'Could not find that event.';
      mutate((current) => ({
        ...current,
        events: current.events.map((item) =>
          item.id === event.id
            ? {
                ...item,
                title: String(payload.title || item.title).trim(),
                date: resolveAiDate(payload.date) || item.date,
                time: resolveAiTime(payload.time) || item.time
              }
            : item
        )
      }));
      return payload.success_message || 'Event updated.';
    }

    if (action === 'delete_event') {
      const event = findEvent(payload.id || payload.title);
      if (!event) return 'Could not find that event.';
      mutate((current) => ({
        ...current,
        events: current.events.filter((item) => item.id !== event.id)
      }));
      return payload.success_message || 'Event removed.';
    }

    if (action === 'list_events') {
      const upcoming = state.events
        .filter((event) => !isEventCompleted(event))
        .sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
      if (!upcoming.length) return 'You have no upcoming events.';
      return upcoming
        .slice(0, 12)
        .map((event, index) => {
          const when = [event.date, event.time].filter(Boolean).join(' ');
          return `${index + 1}. ${event.title}${when ? ` — ${when}` : ''}`;
        })
        .join('\n');
    }

    if (action === 'create_habit') {
      const names = splitAiLines(payload.title || payload.content);
      const habitNames = names.length ? names : [String(payload.title || payload.content || '').trim()].filter(Boolean);
      if (!habitNames.length) return 'Habit name is missing.';
      const checkCount = parseHabitCheckCount(payload);

      mutate((current) => {
        const growthStartDate = current.growthStartDate || todayKey();
        return {
          ...current,
          growthStartDate,
          habits: [
            ...current.habits,
            ...habitNames.map((name) => ({
              id: uid('habit'),
              name,
              color: '#8b5cf6',
              startDate: growthStartDate,
              createdAt: new Date().toISOString(),
              checks: buildInitialHabitChecks(growthStartDate, checkCount)
            }))
          ]
        };
      });

      if (checkCount > 0) {
        return payload.success_message || `Habit added with ${checkCount} day${checkCount === 1 ? '' : 's'} checked.`;
      }
      return payload.success_message || (habitNames.length > 1 ? `${habitNames.length} habits added.` : 'Habit added.');
    }

    if (action === 'delete_habit') {
      const habit = findHabit(payload.id || payload.title || payload.content);
      if (!habit) return 'Could not find that habit.';
      mutate((current) => ({
        ...current,
        habits: current.habits.filter((item) => item.id !== habit.id),
        growthStartDate: inferGrowthStartDate(current.habits.filter((item) => item.id !== habit.id)) || current.growthStartDate
      }));
      return payload.success_message || 'Habit removed.';
    }

    if (action === 'check_habit' || action === 'uncheck_habit') {
      const habit = findHabit(payload.id || payload.title || payload.content);
      if (!habit) return 'Could not find that habit.';
      const days = resolveHabitCheckDays(payload, habit);
      mutate((current) => ({
        ...current,
        habits: current.habits.map((item) => {
          if (item.id !== habit.id) return item;
          return {
            ...item,
            startDate: habitStartKey(item) || days[0],
            checks: applyHabitChecks(item.checks, days, action === 'check_habit')
          };
        })
      }));
      if (action === 'check_habit' && days.length > 1) {
        return payload.success_message || `${days.length} days checked for ${habit.name}.`;
      }
      return payload.success_message || (action === 'check_habit' ? 'Habit marked done.' : 'Habit mark removed.');
    }

    if (action === 'list_habits') {
      if (!state.habits.length) return 'You have no growth habits yet.';
      return state.habits
        .slice(0, 12)
        .map((habit, index) => `${index + 1}. ${habit.name} (${habitProgress(habit)}/30)`)
        .join('\n');
    }

    if (action === 'create_pick') {
      const pick = normalizePick({
        symbol: payload.title || payload.content,
        source: payload.category || payload.source || 'Manual',
        bias: payload.description || payload.bias || 'Watch',
        entry: payload.entry || '',
        target: payload.target || '',
        stop: payload.stop || ''
      });
      if (!pick.symbol || pick.symbol === 'UNKNOWN') return 'Stock symbol is missing.';

      mutate((current) => ({
        ...current,
        picks: [pick, ...current.picks]
      }));
      return payload.success_message || `${pick.symbol} pick added.`;
    }

    if (action === 'delete_pick') {
      const pick = findPick(payload.id || payload.title || payload.content);
      if (!pick) return 'Could not find that pick.';
      if (isSyncedStockPick(pick)) {
        picksApi('delete', {
          id: pick.id,
          symbol: pick.symbol,
          source: String(pick.source || '').toLowerCase()
        }).catch(() => {});
      }
      mutate((current) => ({
        ...current,
        picks: current.picks.filter((item) => item.id !== pick.id)
      }));
      return payload.success_message || 'Pick removed.';
    }

    if (action === 'list_picks') {
      if (!state.picks.length) return 'You have no stock picks yet.';
      return state.picks
        .slice(0, 12)
        .map((pick, index) => `${index + 1}. ${pick.symbol} (${pick.source}) — ${pick.bias || 'Watch'}`)
        .join('\n');
    }

    if (action === 'recommend_pick') {
      const scored = scoreAllStockPicks(state.picks);
      if (!scored.length) return 'You have no stock picks yet — sync picks first, then ask again.';
      const top = scored[0];
      const runners = scored.slice(1, 4).map((entry) => `${entry.pick.symbol} (${entry.total}/100)`).join(', ');
      const lines = [
        `🏆 Top pick: ${top.pick.symbol} — score ${top.total}/100 (${top.pick.bias || 'Watch'})`,
        `Entry ${top.pick.entry || '—'} · Target ${top.pick.target || '—'} · Stop ${top.pick.stop || '—'}`,
        ''
      ];
      top.breakdown.forEach((item) => {
        lines.push(` • ${item.label} (${item.weight}%): ${item.score}/100 → +${item.contribution.toFixed(1)}`);
      });
      if (runners) {
        lines.push('');
        lines.push(`Runners-up: ${runners}`);
      }
      return lines.join('\n');
    }

    if (action === 'rank_picks') {
      const scored = scoreAllStockPicks(state.picks);
      if (!scored.length) return 'You have no stock picks yet.';
      const lines = ['Ranked picks (weighted score):'];
      scored.slice(0, 12).forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.pick.symbol} — ${entry.total}/100 (${entry.pick.bias || 'Watch'})`);
      });
      return lines.join('\n');
    }

    if (action === 'pick_score_breakdown') {
      const scored = scoreAllStockPicks(state.picks);
      if (!scored.length) return 'You have no stock picks yet.';
      const target = (payload.title || payload.symbol || '').toString().trim().toUpperCase();
      const entry = scored.find((item) => item.pick.symbol.toUpperCase() === target) || scored[0];
      return buildStockScoreBreakdownMessage(entry);
    }

    if (action === 'create_album') {
      const name = String(payload.title || payload.content || '').trim();
      if (!name) return 'Album name is missing.';
      const id = uid('album');
      ui.selectedAlbumId = id;
      mutate((current) => ({
        ...current,
        albums: [
          ...(current.albums || []),
          {
            id,
            name,
            locked: false,
            createdAt: new Date().toISOString()
          }
        ]
      }));
      return payload.success_message || `Album "${name}" created.`;
    }

    if (action === 'delete_album') {
      const album = findAlbum(payload.id || payload.title || payload.content);
      if (!album) return 'Could not find that album.';
      if (album.id === DEFAULT_ALBUM_ID) return 'The default album cannot be removed.';
      mutate((current) => ({
        ...current,
        albums: (current.albums || []).filter((item) => item.id !== album.id),
        photos: (current.photos || []).map((file) =>
          (file.albumId || DEFAULT_ALBUM_ID) === album.id
            ? { ...file, albumId: DEFAULT_ALBUM_ID }
            : file
        )
      }));
      if (ui.selectedAlbumId === album.id) ui.selectedAlbumId = DEFAULT_ALBUM_ID;
      return payload.success_message || 'Album removed.';
    }

    if (action === 'list_albums') {
      const albums = state.albums && state.albums.length ? state.albums : [defaultAlbum(state.updatedAt)];
      return albums
        .map((album, index) => {
          const count = (state.photos || []).filter((file) => (file.albumId || DEFAULT_ALBUM_ID) === album.id).length;
          return `${index + 1}. ${album.name}${album.locked ? ' (locked)' : ''} — ${count} file${count === 1 ? '' : 's'}`;
        })
        .join('\n');
    }

    if (action === 'list_files') {
      const album = findAlbum(payload.title || payload.category || payload.id);
      const files = (state.photos || []).filter((file) => {
        if (!album) return true;
        return (file.albumId || DEFAULT_ALBUM_ID) === album.id;
      });
      if (!files.length) return album ? `No files in ${album.name}.` : 'You have no files yet.';
      return files
        .slice(0, 12)
        .map((file, index) => `${index + 1}. ${file.name || 'Untitled'} (${fileKind(file)})`)
        .join('\n');
    }

    if (action === 'list_dashboard') {
      const openTasks = state.tasks.filter((task) => !task.done).length;
      return [
        `Notes: ${state.notes.length}`,
        `Open tasks: ${openTasks}`,
        `Events: ${state.events.length}`,
        `Habits: ${state.habits.length}`,
        `Picks: ${state.picks.length}`,
        `Albums: ${(state.albums || []).length}`,
        `Files: ${(state.photos || []).length}`
      ].join('\n');
    }

    return payload.success_message || 'Action completed.';
  }

  function renderAiMessages() {
    return aiMessages
      .map((entry) => {
        const roleClass = entry.role === 'user' ? 'hk-ai-msg-user' : 'hk-ai-msg-assistant';
        return `<div class="hk-ai-msg ${roleClass}">${escapeHtml(entry.text)}</div>`;
      })
      .join('');
  }

  function renderAiPanel() {
    if (!isDashboardUnlocked()) return '';

    return `<div class="hk-ai-root ${ui.aiOpen ? 'open' : ''}" id="hk-ai-root">
      <button type="button" class="hk-ai-fab" id="hk-ai-toggle" aria-label="Open HK AI">
        <span class="hk-ai-fab-mark">AI</span>
      </button>
      <section class="hk-ai-panel" id="hk-ai-panel" aria-label="HK AI assistant">
        <header class="hk-ai-header">
          <div>
            <p class="eyebrow">Assistant</p>
            <h3>HK AI</h3>
          </div>
          <button type="button" class="hk-ai-close" id="hk-ai-close" aria-label="Close HK AI">Close</button>
        </header>
        <div class="hk-ai-messages" id="hk-ai-messages">
          ${renderAiMessages()}
          ${ui.aiLoading ? '<div class="hk-ai-msg hk-ai-msg-assistant hk-ai-msg-loading">Thinking...</div>' : ''}
        </div>
        <form class="hk-ai-compose" id="hk-ai-form">
          <input id="hk-ai-input" placeholder="Open YouTube, add task, check habits..." autocomplete="off" ${ui.aiLoading ? 'disabled' : ''} />
          <button type="submit" ${ui.aiLoading ? 'disabled' : ''}>Send</button>
        </form>
        <p class="hk-ai-footnote">Chats are temporary. Only dashboard changes are saved.</p>
      </section>
    </div>`;
  }

  function refreshAiPanel() {
    const messages = document.getElementById('hk-ai-messages');
    if (!messages) return;
    messages.innerHTML = `${renderAiMessages()}${ui.aiLoading ? '<div class="hk-ai-msg hk-ai-msg-assistant hk-ai-msg-loading">Thinking...</div>' : ''}`;
    messages.scrollTop = messages.scrollHeight;
  }

  function openAiAssistant() {
    if (ui.aiOpen) return;
    ui.aiOpen = true;
    render();
  }

  async function sendAiMessage(text) {
    const message = String(text || '').trim();
    if (!message || ui.aiLoading) return;

    aiMessages.push({ role: 'user', text: message });
    ui.aiLoading = true;
    refreshAiPanel();

    const localAction = parseClientAiAction(message);
    if (localAction) {
      aiMessages.push({ role: 'assistant', text: executeAiAction(localAction) });
      ui.aiLoading = false;
      refreshAiPanel();
      document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
      return;
    }

    try {
      const payload = await aiApiRequest({
        message,
        context: buildAiContext(),
        history: aiMessages.slice(-10)
      });

      const reply = executeAiAction(payload.result);
      aiMessages.push({ role: 'assistant', text: reply });
    } catch (error) {
      const fallback = parseClientAiAction(message);
      aiMessages.push({
        role: 'assistant',
        text: fallback
          ? executeAiAction(fallback)
          : 'I could not reach the AI service right now. Try a direct command like "open YouTube", "add task buy milk", or "list habits".'
      });
    } finally {
      ui.aiLoading = false;
      const panel = document.getElementById('hk-ai-messages');
      if (panel) {
        refreshAiPanel();
        document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
      } else {
        render();
      }
    }
  }

  function bindAiEvents() {
    document.getElementById('hk-ai-toggle')?.addEventListener('click', () => {
      ui.aiOpen = !ui.aiOpen;
      render();
      if (ui.aiOpen) document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
    });

    document.getElementById('hk-ai-close')?.addEventListener('click', () => {
      ui.aiOpen = false;
      render();
    });

    document.getElementById('hk-ai-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('hk-ai-input');
      const value = input?.value || '';
      if (input) input.value = '';
      sendAiMessage(value);
    });
  }


  function renderAiMessages() {
    return aiMessages
      .map((entry) => {
        const roleClass = entry.role === 'user' ? 'hk-ai-msg-user' : 'hk-ai-msg-assistant';
        return `<div class="hk-ai-msg ${roleClass}">${escapeHtml(entry.text)}</div>`;
      })
      .join('');
  }

  function renderAiPanel() {
    if (!isDashboardUnlocked()) return '';

    return `<div class="hk-ai-root ${ui.aiOpen ? 'open' : ''}" id="hk-ai-root">
      <button type="button" class="hk-ai-fab" id="hk-ai-toggle" aria-label="Open HK AI">
        <span class="hk-ai-fab-mark">AI</span>
      </button>
      <section class="hk-ai-panel" id="hk-ai-panel" aria-label="HK AI assistant">
        <header class="hk-ai-header">
          <div>
            <p class="eyebrow">Assistant</p>
            <h3>HK AI</h3>
          </div>
          <button type="button" class="hk-ai-close" id="hk-ai-close" aria-label="Close HK AI">Close</button>
        </header>
        <div class="hk-ai-messages" id="hk-ai-messages">
          ${renderAiMessages()}
          ${ui.aiLoading ? '<div class="hk-ai-msg hk-ai-msg-assistant hk-ai-msg-loading">Thinking...</div>' : ''}
        </div>
        <form class="hk-ai-compose" id="hk-ai-form">
          <input id="hk-ai-input" placeholder="Open YouTube, add task, check habits..." autocomplete="off" ${ui.aiLoading ? 'disabled' : ''} />
          <button type="submit" ${ui.aiLoading ? 'disabled' : ''}>Send</button>
        </form>
        <p class="hk-ai-footnote">Chats are temporary. Only dashboard changes are saved.</p>
      </section>
    </div>`;
  }

  function refreshAiPanel() {
    const messages = document.getElementById('hk-ai-messages');
    if (!messages) return;
    messages.innerHTML = `${renderAiMessages()}${ui.aiLoading ? '<div class="hk-ai-msg hk-ai-msg-assistant hk-ai-msg-loading">Thinking...</div>' : ''}`;
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendAiMessage(text) {
    const message = String(text || '').trim();
    if (!message || ui.aiLoading) return;

    aiMessages.push({ role: 'user', text: message });
    ui.aiLoading = true;
    refreshAiPanel();

    const localAction = parseClientAiAction(message);
    if (localAction) {
      aiMessages.push({ role: 'assistant', text: executeAiAction(localAction) });
      ui.aiLoading = false;
      refreshAiPanel();
      document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
      return;
    }

    try {
      const payload = await aiApiRequest({
        message,
        context: buildAiContext(),
        history: aiMessages.slice(-10)
      });

      const reply = executeAiAction(payload.result);
      aiMessages.push({ role: 'assistant', text: reply });
    } catch (error) {
      const fallback = parseClientAiAction(message);
      aiMessages.push({
        role: 'assistant',
        text: fallback
          ? executeAiAction(fallback)
          : 'I could not reach the AI service right now. Try a direct command like "open YouTube", "add task buy milk", or "list habits".'
      });
    } finally {
      ui.aiLoading = false;
      const panel = document.getElementById('hk-ai-messages');
      if (panel) {
        refreshAiPanel();
        document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
      } else {
        render();
      }
    }
  }

  function bindAiEvents() {
    document.getElementById('hk-ai-toggle')?.addEventListener('click', () => {
      ui.aiOpen = !ui.aiOpen;
      render();
      if (ui.aiOpen) document.getElementById('hk-ai-input')?.focus({ preventScroll: true });
    });

    document.getElementById('hk-ai-close')?.addEventListener('click', () => {
      ui.aiOpen = false;
      render();
    });

    document.getElementById('hk-ai-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('hk-ai-input');
      const value = input?.value || '';
      if (input) input.value = '';
      sendAiMessage(value);
    });
  }

  function render() {
    if (!isDashboardUnlocked()) {
      root.innerHTML = renderPasswordGate();
      bindGateEvents();
      return;
    }

    const scrollY = window.scrollY;
    const aiScrollTop = document.getElementById('hk-ai-messages')?.scrollTop || 0;
    const drafts = captureDraftState();
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
        ${renderAccount()}
        ${renderStoragePanel()}
      </section>
    </main>
    ${renderFileModal()}${renderAiPanel()}`;

    bindEvents();
    bindAiEvents();
    restoreDraftState(drafts);
    window.scrollTo(0, scrollY);
    const aiMessagesEl = document.getElementById('hk-ai-messages');
    if (aiMessagesEl) {
      aiMessagesEl.scrollTop = ui.aiOpen ? Math.max(aiScrollTop, aiMessagesEl.scrollHeight - aiMessagesEl.clientHeight) : aiScrollTop;
    }
    startClockTicker();
    bootOneSignal({ requestPermission: true });
    if (!calendarDeepLinkHandled && window.location.pathname === '/calendar') {
      calendarDeepLinkHandled = true;
      document.querySelector('.calendar-panel')?.scrollIntoView({ block: 'start' });
    }
  }
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

    document.querySelectorAll('[data-event-notify]').forEach((button) => {
      button.addEventListener('click', () => toggleEventNotifications(button.dataset.eventNotify));
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

    document.querySelectorAll('[data-note-copy]').forEach((button) => {
      button.addEventListener('click', (event) => copyNote(event.currentTarget));
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
    byId('ai-recommend-pick')?.addEventListener('click', () => {
      openAiAssistant();
      sendAiMessage('best stock to buy');
    });
    byId('ai-rank-picks')?.addEventListener('click', () => {
      openAiAssistant();
      sendAiMessage('rank my stock picks');
    });
    document.querySelectorAll('[data-pick-delete]').forEach((button) => {
      button.addEventListener('click', () => deletePick(button.dataset.pickDelete));
    });
    document.querySelectorAll('[data-pick-breakdown]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.pickBreakdown;
        ui.openBreakdownPickId = ui.openBreakdownPickId === id ? '' : id;
        render();
      });
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

    byId('purge-orphans')?.addEventListener('click', () => {
      purgeOrphanCloudFiles().catch((error) => {
        setNotice(error.message || 'Purge failed.');
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

  function noteClipboardText(note) {
    const parts = [];
    if (note.title) parts.push(String(note.title));
    if (note.body) parts.push(String(note.body));
    (Array.isArray(note.codeBlocks) ? note.codeBlocks : []).forEach((block) => {
      const lang = String(block?.lang || 'text').trim() || 'text';
      const content = String(block?.content || '');
      if (content) parts.push(`[${lang}]\n${content}`);
    });
    return parts.join('\n\n').trim();
  }

  async function writeClipboard(text) {
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
    return copied;
  }

  function flashCopyButton(button, copied) {
    const original = button.textContent;
    button.textContent = copied ? 'Copied' : 'Failed';
    button.classList.toggle('copied', copied);
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copied');
    }, 1500);
  }

  async function copyNote(button) {
    const noteId = button.getAttribute('data-note-copy');
    const note = (state.notes || []).find((item) => item.id === noteId);
    if (!note) return;
    flashCopyButton(button, await writeClipboard(noteClipboardText(note)));
  }

  async function copyCodeBlock(button) {
    const blockId = button.getAttribute('data-note-copy-code');
    if (!blockId) return;
    const pre = document.querySelector(`[data-note-code-content="${blockId}"]`);
    const text = pre ? pre.textContent || '' : '';
    flashCopyButton(button, await writeClipboard(text));
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
    mutate((current) => {
      const target = current.events.find((event) => event.id === id);
      if (!target) return current;
      const completedAt = new Date().toISOString();
      const completed = historyFromEvent({
        ...target,
        completed: true,
        done: true,
        completedAt
      });
      return {
        ...current,
        events: current.events.filter((event) => event.id !== id),
        eventHistory: [completed, ...current.eventHistory.filter((event) => event.originalEventId !== id)]
      };
    });
  }

  function toggleEventNotifications(id) {
    if (!id) return;
    mutate((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === id
          ? {
              ...event,
              notificationEnabled: event.notificationEnabled === false
            }
          : event
      )
    }));
    requestOneSignalPermission();
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
    const notificationEnabled = document.getElementById('event-notify')?.checked !== false;
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
          completed: false,
          done: false,
          notificationEnabled,
          notificationFlags: normalizeNotificationFlags(),
          timeZone: config.REMINDER_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          createdAt: new Date().toISOString()
        }
      ]
    }));
    ui.selectedDate = date;
    if (notificationEnabled) requestOneSignalPermission();
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
    if (files.length) setNotice(`Removing ${files.length} file${files.length === 1 ? '' : 's'} from cloud storage…`);

    const failures = [];
    let cloudDeleted = 0;
    let localOnly = 0;
    for (const file of files) {
      try {
        const result = await removeStoredFile(file);
        if (result?.deleted) cloudDeleted += 1;
        else if (result?.skipped) localOnly += 1;
      } catch (error) {
        failures.push({ name: file.name || 'file', message: error.message || 'Unknown error' });
      }
    }

    if (failures.length === files.length && files.length) {
      setNotice(`Could not remove cloud files. Album kept. (${failures[0]?.message || 'unknown error'})`);
      return;
    }

    if (files.some((file) => file.id === ui.activeFileId)) closeFile();
    ui.selectedAlbumId = DEFAULT_ALBUM_ID;

    mutate((current) => ({
      ...current,
      albums: current.albums.filter((item) => item.id !== id),
      photos: current.photos.filter((file) => (file.albumId || DEFAULT_ALBUM_ID) !== id)
    }));

    if (failures.length) {
      const failedNames = failures.map((f) => f.name).slice(0, 3).join(', ');
      const more = failures.length > 3 ? ` and ${failures.length - 3} more` : '';
      setNotice(`Album removed. ${cloudDeleted} deleted from cloud, ${failures.length} kept (${failedNames}${more}).`);
    } else if (cloudDeleted) {
      setNotice(`Album removed. ${cloudDeleted} file${cloudDeleted === 1 ? '' : 's'} permanently deleted from cloud storage.`);
    } else if (localOnly) {
      setNotice(`Album removed. ${localOnly} file${localOnly === 1 ? '' : 's'} cleared from this browser (were not in cloud).`);
    } else {
      setNotice('Album removed.');
    }
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

    for (const file of selected) {
      try {
        uploaded.push(await uploadStoredFile(file, album.id));
      } catch (error) {
        console.warn('Cloud file upload failed; using browser fallback.', error);
        uploaded.push(await createLocalFileRecord(file, album.id));
      }
    }

    mutate((current) => ({
      ...current,
      photos: [...uploaded, ...current.photos]
    }));

    const cloudCount = uploaded.filter((f) => f.storagePath).length;
    const localCount = uploaded.length - cloudCount;
    if (localCount && cloudCount) {
      setNotice(`${cloudCount} saved to cloud, ${localCount} kept in this browser only.`);
    } else if (localCount) {
      setNotice(`${localCount} file${localCount === 1 ? '' : 's'} saved in this browser only — cloud storage was not ready.`);
    } else {
      setNotice(`${cloudCount} file${cloudCount === 1 ? '' : 's'} saved to cloud storage.`);
    }
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
    if (!file?.storagePath) {
      return { skipped: true, reason: 'local-only' };
    }
    const result = await fileApi('delete', {
      bucket: file.storageBucket || FILE_BUCKET,
      path: file.storagePath
    });
    return { deleted: true, attempt: result?.attempt, bucket: result?.bucket, path: result?.path };
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

    setNotice(`Removing "${file.name || 'file'}" from cloud storage…`);
    let result;
    try {
      result = await removeStoredFile(file);
    } catch (error) {
      setNotice(`${error.message || 'Could not remove cloud file.'} File kept in dashboard.`);
      return;
    }

    if (ui.activeFileId === id) closeFile();

    mutate((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== id)
    }));

    if (result && result.deleted) {
      setNotice(`"${file.name || 'file'}" permanently removed from cloud storage.`);
    } else if (result && result.skipped) {
      setNotice(`"${file.name || 'file'}" removed from this browser (was not in cloud storage).`);
    } else {
      setNotice(`"${file.name || 'file'}" removed.`);
    }
  }

  async function purgeOrphanCloudFiles() {
    if (!client || !session) {
      setNotice('Sign in first so we can compare cloud files against your dashboard.');
      return;
    }
    if (!window.confirm('Delete every cloud file in the personal folder that is NOT referenced by your dashboard? This is permanent.')) {
      return;
    }

    setNotice('Scanning cloud storage for orphan files…');

    const keepPaths = (state.photos || [])
      .map((file) => file?.storagePath)
      .filter(Boolean)
      .map((path) => String(path).replace(/^personal\//, ''))
      .map((name) => `personal/${name}`);

    const result = await fileApi('purge-orphans', {
      bucket: FILE_BUCKET,
      folder: 'personal',
      keepPaths
    });

    if (!result?.removed) {
      setNotice(`Scanned ${result?.scanned || 0} cloud files. No orphans — everything in cloud storage is still referenced.`);
      return;
    }
    setNotice(`Purged ${result.removed} orphan file${result.removed === 1 ? '' : 's'} from cloud storage. Scanned ${result.scanned || 0}.`);
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
