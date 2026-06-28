// Habits — 30-day progress grid
function Habits() {
  const t = useTheme();

  // Generate 30-day window centered on today (June 28, 2026): 12 -> 11 like screenshot
  const today = new Date('2026-06-28T13:01:00');
  const days = useMemo(() => {
    const arr = [];
    const start = new Date(today);
    start.setDate(start.getDate() - 16); // 16 days back -> 14 days forward
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push({ key: d.toISOString().slice(0,10), day: d.getDate(), isToday: d.toDateString() === today.toDateString(), past: d <= today });
    }
    return arr;
  }, []);

  const [habits, setHabits] = useLocalStorage('hk_habits', [
    {
      id: 1, name: 'Workout', color: '#5eead4',
      // Pre-fill 26 done out of past days
      log: (() => {
        const o = {};
        const arr = [];
        const start = new Date('2026-06-28T13:01:00'); start.setDate(start.getDate() - 16);
        for (let i = 0; i < 30; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i);
          arr.push(d.toISOString().slice(0,10));
        }
        // Mark 26 of the first 26 past days as done; skip days 4 and 12 randomly
        const skip = new Set([4, 12]);
        arr.slice(0, 28).forEach((k, i) => { if (!skip.has(i)) o[k] = true; });
        return o;
      })(),
    },
  ]);

  const [draft, setDraft] = useState('');

  const addHabit = () => {
    if (!draft.trim()) return;
    const colors = ['#5eead4','#a78bfa','#22d3ee','#f59e0b','#10b981','#f43f5e'];
    setHabits([...habits, { id: Date.now(), name: draft.trim(), color: colors[habits.length % colors.length], log: {} }]);
    setDraft('');
  };

  const toggleDay = (habitId, dayKey) => {
    setHabits(habits.map(h => {
      if (h.id !== habitId) return h;
      const log = { ...h.log };
      if (log[dayKey]) delete log[dayKey]; else log[dayKey] = true;
      return { ...h, log };
    }));
  };

  const removeHabit = (id) => setHabits(habits.filter(h => h.id !== id));

  return (
    <Panel
      label="Growth"
      title="30-day progress"
      action={
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: hexToRgba(t.accent1, 0.15),
          border: `1px solid ${hexToRgba(t.accent1, 0.3)}`,
          display: 'grid', placeItems: 'center',
          color: t.accent1, fontWeight: 700, fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        }}>GY</div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10, marginBottom: 22 }}>
        <TextInput value={draft} onChange={setDraft} placeholder="Add habit name" onKeyDown={(e) => e.key === 'Enter' && addHabit()} />
        <Btn variant="ghost" onClick={addHabit}>Add</Btn>
      </div>

      {/* Day header */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 80px 90px 1fr', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div></div><div></div><div></div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 4 }}>
          {days.map(d => (
            <div key={d.key} style={{
              textAlign: 'center', fontSize: 11, color: d.isToday ? t.accent1 : t.textMute,
              fontFamily: 'JetBrains Mono, monospace', fontWeight: d.isToday ? 700 : 500,
            }}>{String(d.day).padStart(2,'0')}</div>
          ))}
        </div>
      </div>

      {habits.map(h => {
        const doneCount = Object.values(h.log).filter(Boolean).length;
        return (
          <div key={h.id} style={{
            display: 'grid',
            gridTemplateColumns: '180px 80px 90px 1fr',
            alignItems: 'center', gap: 12,
            padding: '12px 0',
            borderTop: `1px solid ${t.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, boxShadow: `0 0 12px ${h.color}` }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{h.name}</span>
            </div>
            <div className="mono" style={{ fontSize: 13, color: t.textDim }}>{doneCount}/30</div>
            <button onClick={() => removeHabit(h.id)} style={{
              fontSize: 10, padding: '5px 10px',
              background: hexToRgba(t.danger, 0.1),
              border: `1px solid ${hexToRgba(t.danger, 0.3)}`,
              borderRadius: 5,
              color: t.danger, fontWeight: 700, letterSpacing: '0.1em',
            }}>REMOVE</button>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 4 }}>
              {days.map(d => {
                const done = !!h.log[d.key];
                return (
                  <button key={d.key} onClick={() => toggleDay(h.id, d.key)} style={{
                    aspectRatio: '1/1',
                    borderRadius: 6,
                    background: done ? h.color : (d.past ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'),
                    border: d.isToday ? `2px solid ${t.accent2}` : `1px solid ${done ? 'transparent' : t.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  title={d.key}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {habits.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: t.textMute }}>No habits yet. Add one above.</div>
      )}
    </Panel>
  );
}

window.Habits = Habits;
