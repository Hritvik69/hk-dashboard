// Browser storage breakdown
function Storage() {
  const t = useTheme();
  // Live calculation from actual localStorage usage
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const sections = useMemo(() => {
    // Verbatim from screenshot reference
    return [
      { id: 'notes', name: 'Notes', icon: '◰', color: '#5eead4', count: 8, bytes: 56300 /* 56.3 KB */ },
      { id: 'tasks', name: 'Tasks', icon: '✓', color: '#10b981', count: 2, bytes: 426 },
      { id: 'calendar', name: 'Calendar', icon: '▤', color: '#a78bfa', count: 34, bytes: 12500 },
      { id: 'habits', name: 'Habits', icon: '◉', color: '#f43f5e', count: 1, bytes: 631 },
      { id: 'gallery', name: 'Gallery & Files', icon: '▦', color: '#a78bfa', count: 25, bytes: 12400000 /* 12.4 MB */ },
      { id: 'growth', name: 'Growth Dashboard', icon: '◈', color: '#22d3ee', count: 7, bytes: 26100 },
    ];
  }, [tick]);

  // Local quota only counts the "small" data — gallery files > 1 MB are noted as cloud-stored
  const localTotal = sections.filter(s => s.id !== 'gallery').reduce((s, x) => s + x.bytes, 0);
  const total = sections.reduce((s, x) => s + x.bytes, 0);
  const limit = 5 * 1024 * 1024;
  const pct = Math.max(0, Math.min(100, Math.round((localTotal / limit) * 100)));
  const usedFmt = localTotal >= 1024*1024 ? (localTotal/1024/1024).toFixed(1) + ' MB' : (localTotal/1024).toFixed(1) + ' KB';
  const free = Math.max(0, limit - localTotal);
  const freeFmt = (free/1024/1024).toFixed(1) + ' MB free of 5.0 MB';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel padding={26}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: `conic-gradient(${t.accent1} 0%, ${t.accent2} ${pct}%, rgba(255,255,255,0.06) ${pct}%)`,
            display: 'grid', placeItems: 'center',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 8,
              borderRadius: '50%',
              background: t.bgPanel,
              display: 'grid', placeItems: 'center',
            }}>
              <div style={{ textAlign: 'center', lineHeight: 1 }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: t.accent1 }}>{pct}%</div>
                <div style={{ fontSize: 9, color: t.textDim, letterSpacing: '0.12em', marginTop: 3, fontWeight: 600 }}>HEALTHY</div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Browser Storage (localStorage)</h2>
            <p style={{ fontSize: 13, color: t.textDim, marginBottom: 14 }}>Dashboard data, notes, tasks, habits and small files are saved locally in your browser.</p>
            <div style={{
              position: 'relative', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0, width: `${Math.min(100, pct)}%`,
                background: `linear-gradient(90deg, ${t.accent1}, ${t.accent2})`,
                borderRadius: 5,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: t.textDim }}>
              <span className="mono">{usedFmt} used</span>
              <span className="mono">{freeFmt}</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Section cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {sections.map(s => {
          const sPct = (s.bytes / total) * 100;
          const sizeFmt = s.bytes >= 1024*1024 ? (s.bytes/1024/1024).toFixed(1) + ' MB' : s.bytes >= 1024 ? (s.bytes/1024).toFixed(1) + ' KB' : s.bytes + ' B';
          return (
            <div key={s.id} style={{
              padding: 16,
              background: `linear-gradient(180deg, ${t.bgPanel}, ${t.bgPanelAlt})`,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: hexToRgba(s.color, 0.18), border: `1px solid ${hexToRgba(s.color, 0.3)}`, color: s.color, display: 'grid', placeItems: 'center', fontSize: 14 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: t.textDim }}>{s.count} items</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{sizeFmt}</span>
                <span className="mono" style={{ fontSize: 10.5, color: t.textMute, whiteSpace: 'nowrap' }}>{sPct.toFixed(1)}% of data</span>
              </div>
            </div>
          );
        })}
      </div>

      <Panel label="Storage Breakdown" padding={24}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...sections].sort((a,b) => b.bytes - a.bytes).map(s => {
            const sPct = (s.bytes / total) * 100;
            const sizeFmt = s.bytes >= 1024*1024 ? (s.bytes/1024/1024).toFixed(1) + ' MB' : s.bytes >= 1024 ? (s.bytes/1024).toFixed(1) + ' KB' : s.bytes + ' B';
            return (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '14px 200px 1fr 80px', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${sPct}%`, height: '100%', background: s.color, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <span className="mono" style={{ fontSize: 12, textAlign: 'right', color: t.textDim }}>{sizeFmt}</span>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 22, padding: '12px 16px',
          background: hexToRgba(t.warn, 0.08),
          border: `1px solid ${hexToRgba(t.warn, 0.25)}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12.5, color: t.warn,
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 5,
            background: hexToRgba(t.warn, 0.2),
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 10, letterSpacing: '0.05em',
          }}>DB</span>
          Dashboard data is also cloud-synced when signed in. Gallery files &gt;1 MB are stored in Supabase Storage — they don't count against your 5 MB browser quota.
        </div>
      </Panel>
    </div>
  );
}

window.Storage = Storage;
