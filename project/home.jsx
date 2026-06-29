// Home view — greeting, quick links, calendar, notes & tasks
function Home() {
  const t = useTheme();
  const [now, setNow] = useState(new Date('2026-06-28T13:01:00'));
  // Real clock advancing from a fixed start so it feels alive
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const [notes, setNotes] = useLocalStorage('hk_notes', [
    { id: 1, type: 'note', text: '<!DOCTYPE html>', long: '', date: '2026-06-27' },
    { id: 2, type: 'note', text: 'Project ideas Q3', long: 'Mood-Lens v2, Test Paper Gen, finish radar refactor', date: '2026-06-26' },
    { id: 3, type: 'note', text: 'Reading list', long: 'Antifragile, Stillness is the Key, Atomic Habits', date: '2026-06-25' },
    { id: 4, type: 'note', text: 'Workout split', long: 'Push/Pull/Legs — 5x a week', date: '2026-06-24' },
    { id: 5, type: 'note', text: 'Stock watch', long: 'ADANIPORTS, KICL, ERIS — recheck Monday', date: '2026-06-23' },
    { id: 6, type: 'note', text: 'Daily review', long: 'Mornings = deep work. Phone in drawer.', date: '2026-06-22' },
    { id: 7, type: 'note', text: 'Trip planning', long: 'Manali — last week of August', date: '2026-06-20' },
    { id: 8, type: 'note', text: 'Music', long: 'New playlist: lo-fi, brian eno, hania rani', date: '2026-06-19' },
  ]);
  const [tasks, setTasks] = useLocalStorage('hk_tasks', [
    { id: 1, text: 'Complete Hindi Portfolio', priority: 'Normal', done: true, due: '2026-06-22' },
    { id: 2, text: 'Review June stock picks', priority: 'High', done: false, due: '2026-06-29' },
  ]);
  const [draftText, setDraftText] = useState('');
  const [draftLong, setDraftLong] = useState('');
  const [draftPriority, setDraftPriority] = useState('Normal');
  const [calMonth, setCalMonth] = useLocalStorage('hk_calMonth', { y: 2026, m: 5 }); // 0-indexed

  const openNotes = notes.length;
  const openTasks = tasks.filter(x => !x.done).length;
  const picks = 9;

  const quickLinks = [
    { id: 'TP', name: 'Test Paper Generator', short: 'TP', color: '#5eead4' },
    { id: 'ST', name: 'Stock Screener', short: 'ST', color: '#a78bfa' },
    { id: 'TV', name: 'TradingView', short: 'TV', color: '#22d3ee' },
    { id: 'GH', name: 'GitHub', short: 'GH', color: '#f0f0f5' },
    { id: 'YT', name: 'YouTube', short: 'YT', color: '#f43f5e' },
    { id: 'AI', name: 'ChatGPT', short: 'AI', color: '#10b981' },
  ];

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Good night';
  }, [now]);

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '');

  // Calendar
  const calData = useMemo(() => {
    const { y, m } = calMonth;
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startDay = first.getDay();
    const prevMonthLast = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = startDay - 1; i >= 0; i--) cells.push({ day: prevMonthLast - i, muted: true });
    for (let d = 1; d <= lastDay; d++) cells.push({ day: d, muted: false });
    while (cells.length < 42) cells.push({ day: cells.length - lastDay - startDay + 1, muted: true });
    return { cells, monthName: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }, [calMonth]);

  const isToday = (day, muted) => !muted && now.getFullYear() === calMonth.y && now.getMonth() === calMonth.m && now.getDate() === day;

  const addItem = (kind) => {
    if (!draftText.trim()) return;
    if (kind === 'task') {
      setTasks([...tasks, { id: Date.now(), text: draftText.trim(), priority: draftPriority, done: false, due: '' }]);
    } else {
      setNotes([{ id: Date.now(), type: 'note', text: draftText.trim(), long: draftLong, date: now.toISOString().slice(0,10) }, ...notes]);
    }
    setDraftText(''); setDraftLong('');
  };

  const toggleTask = (id) => setTasks(tasks.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const removeTask = (id) => setTasks(tasks.filter(x => x.id !== id));
  const removeNote = (id) => setNotes(notes.filter(x => x.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top bar with logo and time */}
      <Panel padding={26}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
              display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 22, color: '#08080c', letterSpacing: '-0.04em',
              boxShadow: `0 8px 24px ${hexToRgba(t.accent2, 0.3)}`,
            }}>HK</div>
            <div>
              <SectionLabel>Personal Workspace</SectionLabel>
              <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>HK Dashboard</h1>
            </div>
          </div>
          <div style={{
            padding: '10px 18px',
            background: `linear-gradient(135deg, ${hexToRgba(t.warn, 0.15)}, ${hexToRgba(t.warn, 0.05)})`,
            border: `1px solid ${hexToRgba(t.warn, 0.3)}`,
            borderRadius: 10,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 16, fontWeight: 600,
            color: t.warn,
            letterSpacing: '0.04em',
          }}>{timeStr}</div>
        </div>
      </Panel>

      {/* Greeting + Quick links row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.1fr) 2fr', gap: 24 }}>
        <Panel padding={28}>
          <SectionLabel>Today</SectionLabel>
          <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 4, whiteSpace: 'nowrap' }}>
            <Gradient>{greeting}</Gradient>
          </h2>
          <p style={{ color: t.textDim, marginTop: 10, fontSize: 14 }}>{dateStr}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <Pill bg="rgba(255,255,255,0.05)">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: openTasks > 0 ? t.warn : t.textMute, display: 'inline-block' }} />
              {openTasks} open tasks
            </Pill>
            <Pill bg="rgba(255,255,255,0.05)">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent1, display: 'inline-block' }} />
              {openNotes} notes
            </Pill>
            <Pill bg="rgba(255,255,255,0.05)">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent2, display: 'inline-block' }} />
              {picks} picks
            </Pill>
          </div>
        </Panel>

        <Panel padding={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {quickLinks.map(link => (
              <button key={link.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = t.borderStrong; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = t.border; }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: hexToRgba(link.color, 0.15),
                  border: `1px solid ${hexToRgba(link.color, 0.3)}`,
                  display: 'grid', placeItems: 'center',
                  color: link.color,
                  fontWeight: 700, fontSize: 12, letterSpacing: '0.05em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>{link.short}</div>
                <div style={{ flex: 1, fontWeight: 500, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.name}</div>
                <span style={{ fontSize: 11, color: t.textMute, letterSpacing: '0.06em' }}>open</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Calendar + Tasks + Notes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        {/* Calendar Panel */}
        <Panel
          label="Calendar"
          title={calData.monthName}
          action={
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn size="sm" variant="ghost" onClick={() => setCalMonth(({y,m}) => m === 0 ? { y: y-1, m: 11 } : { y, m: m-1 })}>Back</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setCalMonth(({y,m}) => m === 11 ? { y: y+1, m: 0 } : { y, m: m+1 })}>Next</Btn>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10, color: t.textMute, fontWeight: 500, letterSpacing: '0.1em', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calData.cells.map((c, i) => {
              const today = isToday(c.day, c.muted);
              return (
                <div key={i} style={{
                  aspectRatio: '1 / 1',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: today ? 600 : 400,
                  color: c.muted ? t.textMute : (today ? '#08080c' : t.text),
                  background: today ? `linear-gradient(135deg, ${t.accent1}, ${t.accent2})` : 'transparent',
                  borderRadius: 6,
                  cursor: c.muted ? 'default' : 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { if (!c.muted && !today) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { if (!c.muted && !today) e.currentTarget.style.background = 'transparent'; }}
                >{c.day}</div>
              );
            })}
          </div>
        </Panel>

        {/* Tasks Panel */}
        <Panel
          label="Tasks"
          title={`${openTasks} open tasks`}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, marginBottom: 8 }}>
            <TextInput value={draftText} onChange={setDraftText} placeholder="Add a task..." onKeyDown={(e) => e.key === 'Enter' && addItem('task')} />
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: '11px 12px',
                fontSize: 13,
                color: t.text,
                cursor: 'pointer',
              }}
            >
              <option>Normal</option>
              <option>High</option>
              <option>Low</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" variant="accent" onClick={() => addItem('task')}>+ Add Task</Btn>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {tasks.map(task => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${t.border}`,
                borderRadius: 9,
              }}>
                <button onClick={() => toggleTask(task.id)} style={{
                  width: 22, height: 22, flexShrink: 0,
                  borderRadius: 5,
                  background: task.done ? t.success : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${task.done ? t.success : t.borderStrong}`,
                  display: 'grid', placeItems: 'center',
                  fontSize: 11, color: '#08080c', fontWeight: 700,
                }}>{task.done ? 'OK' : ''}</button>
                <span style={{ flex: 1, fontSize: 13, textDecoration: task.done ? 'line-through' : 'none', color: task.done ? t.textMute : t.text }}>{task.text}</span>
                <Pill bg={task.priority === 'High' ? hexToRgba(t.warn, 0.18) : 'rgba(255,255,255,0.06)'} color={task.priority === 'High' ? t.warn : t.textDim}>{task.priority}</Pill>
                <button onClick={() => removeTask(task.id)} style={{
                  fontSize: 10, padding: '4px 6px',
                  background: hexToRgba(t.danger, 0.1),
                  border: `1px solid ${hexToRgba(t.danger, 0.3)}`,
                  borderRadius: 5,
                  color: t.danger, fontWeight: 700, letterSpacing: '0.1em',
                }}>×</button>
              </div>
            ))}
            {tasks.length === 0 && <div style={{ fontSize: 12, color: t.textMute, textAlign: 'center', padding: 20 }}>No tasks yet</div>}
          </div>
        </Panel>

        {/* Notes Panel */}
        <Panel
          label="Notes"
          title={`${openNotes} notes`}
        >
          <div style={{ marginBottom: 8 }}>
            <TextInput value={draftText} onChange={setDraftText} placeholder="Quick note..." onKeyDown={(e) => e.key === 'Enter' && addItem('note')} />
          </div>
          <textarea
            value={draftLong}
            onChange={(e) => setDraftLong(e.target.value)}
            placeholder="Write more details..."
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              width: '100%',
              color: t.text,
              minHeight: 60,
              resize: 'vertical',
              marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" variant="ghost" onClick={() => addItem('note')}>+ Add Note</Btn>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {notes.map(note => (
              <div key={note.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${t.border}`,
                borderRadius: 9,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, fontSize: 13, color: t.text, fontFamily: note.text.startsWith('<') ? 'JetBrains Mono, monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.text}</span>
                  <button onClick={() => removeNote(note.id)} style={{ fontSize: 10, padding: '4px 6px', background: hexToRgba(t.danger, 0.1), border: `1px solid ${hexToRgba(t.danger, 0.3)}`, borderRadius: 5, color: t.danger, fontWeight: 700 }}>×</button>
                </div>
                {note.long && <div style={{ fontSize: 11, color: t.textMute, lineHeight: 1.4 }}>{note.long}</div>}
                <div style={{ fontSize: 10, color: t.textMute }}>{note.date}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

window.Home = Home;
