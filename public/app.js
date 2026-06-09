(function () {
  const STORAGE_KEY = 'hk-dashboard-state-v1';
  const config = window.HK_CONFIG || {};
  const root = document.getElementById('root');

  let client = null;
  let session = null;
  let saveTimer = null;
  let statusText = 'Local browser saving';
  let notice = '';
  let state = mergeDashboard(readLocal());
  const ui = {
    monthCursor: new Date(),
    selectedDate: todayKey(),
    pickFilter: 'All'
  };

  const quickLinks = [
    ['Test Paper Generator', 'https://edu-test-ai-rho.vercel.app/', 'TP'],
    ['Stock Screener', 'https://nse-sentinelmax-msrfjdkwmksf6jama4jvmx.streamlit.app/', 'ST'],
    ['TradingView', 'https://in.tradingview.com/', 'TV'],
    ['GitHub', 'https://github.com/', 'GH'],
    ['YouTube', 'https://www.youtube.com/', 'YT'],
    ['ChatGPT', 'https://chatgpt.com/', 'AI']
  ];

  function defaultDashboard() {
    const now = new Date().toISOString();
    return {
      notes: [
        {
          id: 'note-welcome',
          title: 'Dashboard ready',
          body: 'Use this as your personal workspace. Add notes, tasks, stock picks, reminders, photos, and 30-day habits.',
          pinned: true,
          createdAt: now
        }
      ],
      tasks: [
        {
          id: 'task-first',
          text: 'Set up Supabase when you want cloud sync',
          done: false,
          dueDate: '',
          priority: 'High',
          createdAt: now
        }
      ],
      events: [],
      habits: [
        {
          id: 'habit-admin',
          name: 'Gym workout',
          color: '#ff5c7a',
          checks: {}
        }
      ],
      picks: [],
      photos: [],
      updatedAt: now
    };
  }

  function mergeDashboard(input) {
    const defaults = defaultDashboard();
    const data = input && typeof input === 'object' ? input : {};
    return {
      ...defaults,
      ...data,
      notes: Array.isArray(data.notes) ? data.notes : defaults.notes,
      tasks: Array.isArray(data.tasks) ? data.tasks : defaults.tasks,
      events: Array.isArray(data.events) ? data.events : defaults.events,
      habits: Array.isArray(data.habits) ? data.habits : defaults.habits,
      picks: Array.isArray(data.picks) ? data.picks : defaults.picks,
      photos: Array.isArray(data.photos) ? data.photos : defaults.photos,
      updatedAt: data.updatedAt || defaults.updatedAt
    };
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

  async function initCloud() {
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
    if (session) await loadCloud();

    client.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      statusText = session ? 'Supabase cloud sync' : 'Cloud ready, sign in to sync';
      if (session) await loadCloud();
      render();
    });

    render();
  }

  async function loadCloud() {
    if (!client || !session) return;

    const result = await client
      .from('dashboard_state')
      .select('data')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (result.error) {
      statusText = `Cloud load failed: ${result.error.message}`;
      return;
    }

    if (result.data && result.data.data) {
      state = mergeDashboard(result.data.data);
      writeLocal(state);
    } else {
      await saveCloud();
    }
  }

  async function saveCloud() {
    if (!client || !session) return;

    const result = await client.from('dashboard_state').upsert({
      user_id: session.user.id,
      data: state,
      updated_at: new Date().toISOString()
    });

    if (result.error) {
      statusText = `Cloud save failed: ${result.error.message}`;
      render();
    }
  }

  async function signIn(email) {
    if (!client) {
      setNotice('Add Supabase env vars first.');
      return;
    }

    const result = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    setNotice(result.error ? result.error.message : 'Check your email for the login link.');
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    statusText = 'Signed out, local saving active';
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

  function normalizePick(item) {
    return {
      id: item.id || uid('pick'),
      symbol: String(pickValue(item, ['symbol', 'ticker', 'name'], 'UNKNOWN')).toUpperCase(),
      name: String(pickValue(item, ['name', 'company', 'title'], '')),
      source: String(pickValue(item, ['source', 'type'], 'Manual')).toLowerCase().includes('ai')
        ? 'AI'
        : 'Manual',
      bias: String(pickValue(item, ['bias', 'side', 'signal'], 'Watch')),
      entry: String(pickValue(item, ['entry', 'entry_price'], '')),
      target: String(pickValue(item, ['target', 'target_price'], '')),
      stop: String(pickValue(item, ['stop', 'stop_loss', 'sl'], '')),
      confidence: Number(pickValue(item, ['confidence', 'score'], 0)) || 0,
      notes: String(pickValue(item, ['notes', 'reason', 'summary'], '')),
      createdAt: item.createdAt || new Date().toISOString()
    };
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
      .filter((event) => event.date === ui.selectedDate)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const eventsHtml = selectedEvents.length
      ? selectedEvents
          .map((event) => {
            return `<div class="list-item">
              <span class="icon">CA</span>
              <div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.time || 'All day')}</span></div>
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
        <input id="event-date" type="date" value="${todayKey(1)}" />
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
            return `<button type="button" class="task-item ${task.done ? 'done' : ''}" data-task="${escapeHtml(task.id)}">
              <span class="icon">OK</span>
              <span>${escapeHtml(task.text)}</span>
              <small>${escapeHtml(task.priority || 'Normal')}</small>
            </button>`;
          })
          .join('')
      : '<p class="empty">No todo</p>';

    const notesHtml = state.notes.length
      ? state.notes
          .slice(0, 6)
          .map((note) => {
            return `<div class="note-card">
              <strong>${escapeHtml(note.title || 'Untitled note')}</strong>
              <p>${escapeHtml(note.body || '')}</p>
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
            return `<div class="pick-card">
              <div><strong>${escapeHtml(pick.symbol)}</strong><span>${escapeHtml(pick.source)}</span></div>
              <p>${escapeHtml(pick.bias || 'Watch')}</p>
              <dl>
                <dt>Entry</dt><dd>${escapeHtml(pick.entry || '-')}</dd>
                <dt>Target</dt><dd>${escapeHtml(pick.target || '-')}</dd>
                <dt>Stop</dt><dd>${escapeHtml(pick.stop || '-')}</dd>
              </dl>
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
    const days = Array.from({ length: 30 }, (_, index) => todayKey(index));
    const dayHeader = `<div class="habit-days"><span></span>${days.map((day) => `<b>${day.split('-')[2]}</b>`).join('')}</div>`;
    const rows = state.habits
      .map((habit) => {
        const done = Object.values(habit.checks || {}).filter(Boolean).length;
        return `<div class="habit-row">
          <div class="habit-name"><i style="background:${escapeHtml(habit.color || '#8b5cf6')}"></i><span>${escapeHtml(habit.name)}</span><small>${done}/30</small></div>
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
        <input id="habit-name" placeholder="Add habit, e.g. Gym workout" />
        <button type="button" id="add-habit">Add</button>
      </div>
      <div class="habit-table">${dayHeader}${rows}</div>
    </article>`;
  }

  function renderGallery() {
    const photosHtml = state.photos.length
      ? state.photos
          .slice(0, 8)
          .map((photo) => {
            return `<figure><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name)}" /><figcaption>${escapeHtml(photo.name)}</figcaption></figure>`;
          })
          .join('')
      : '<p class="empty">No photos yet</p>';

    return `<article class="panel gallery-panel">
      <header class="panel-header">
        <div><p class="eyebrow">Gallery</p><h2>${state.photos.length} photos</h2></div>
        <label class="file-button">Upload<input id="photo-input" type="file" accept="image/*" /></label>
      </header>
      <div class="photo-grid">${photosHtml}</div>
    </article>`;
  }

  function renderAccount() {
    const cloudReady = Boolean(client);
    const authHtml = cloudReady
      ? session
        ? `<div class="account-box"><p>Signed in as ${escapeHtml(session.user.email)}</p><button type="button" id="sign-out">Sign out</button></div>`
        : `<form class="account-form" id="sign-in-form"><input id="email" type="email" placeholder="Email for cloud sync" required /><button type="submit">Send link</button></form>`
      : '<p class="muted-copy">Local saving is active. Add Supabase env vars on Vercel for cloud login and cross-device sync.</p>';

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
        <span><span class="icon">PH</span> Photos save in dashboard data</span>
        <span><span class="icon">TS</span> Tailscale-ready local preview</span>
        <span><span class="icon">VC</span> Vercel-ready static build</span>
      </div>
    </article>`;
  }

  function render() {
    const now = new Date();
    const openTasks = state.tasks.filter((task) => !task.done);
    const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';

    root.innerHTML = `<main class="app-shell">
      <section class="hero-panel">
        <div class="status-strip">
          <div class="brand-mark"><span class="icon">HK</span></div>
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
      </section>
    </main>`;

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

    byId('add-event')?.addEventListener('click', addEvent);
    byId('add-task')?.addEventListener('click', addTask);
    byId('add-note')?.addEventListener('click', addNote);
    byId('quick-text')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addTask();
    });

    document.querySelectorAll('[data-task]').forEach((button) => {
      button.addEventListener('click', () => toggleTask(button.dataset.task));
    });

    document.querySelectorAll('[data-pick-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        ui.pickFilter = button.dataset.pickFilter;
        render();
      });
    });

    byId('add-pick')?.addEventListener('click', addPick);
    byId('sync-picks')?.addEventListener('click', syncPicks);
    byId('add-habit')?.addEventListener('click', addHabit);
    byId('habit-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addHabit();
    });

    document.querySelectorAll('[data-habit]').forEach((button) => {
      button.addEventListener('click', () => toggleHabit(button.dataset.habit, button.dataset.habitDay));
    });

    byId('photo-input')?.addEventListener('change', addPhoto);
    byId('export-json')?.addEventListener('click', exportJson);
    byId('import-json')?.addEventListener('change', importJson);

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

  function addEvent() {
    const title = document.getElementById('event-title')?.value.trim();
    const date = document.getElementById('event-date')?.value || todayKey(1);
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

  async function syncPicks() {
    if (!config.STOCK_PICKS_URL) {
      setNotice('Add VITE_STOCK_PICKS_URL to sync from the scanner.');
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
      habits: [
        ...current.habits,
        {
          id: uid('habit'),
          name,
          color: '#8b5cf6',
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
        return { ...habit, checks };
      })
    }));
  }

  function addPhoto(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      mutate((current) => ({
        ...current,
        photos: [
          {
            id: uid('photo'),
            name: file.name,
            url: reader.result,
            size: file.size,
            createdAt: new Date().toISOString()
          },
          ...current.photos
        ]
      }));
    };
    reader.readAsDataURL(file);
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
  initCloud().catch((error) => {
    statusText = `Cloud setup failed: ${error.message}`;
    render();
  });
})();
