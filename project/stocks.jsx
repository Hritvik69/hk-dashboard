// Stock screener — Tomorrow's picks
function Stocks() {
  const t = useTheme();
  const [picks, setPicks] = useLocalStorage('hk_stocks', [
    { sym: 'ADANIPORTS', src: 'MANUAL', verdict: 'Avoid', weighted: 62, srcScore: 65, risk: 0, timing: 'GOOD', setup: 'BREAKOUT READY', volume: 4382549, rsi: 61.18, price: 1835.3, note: 'Clean resistance breakout zone, institutional volume confirmed, controlled RSI, near…', conf: 40 },
    { sym: 'KICL', src: 'MANUAL', verdict: 'Avoid', weighted: 57, srcScore: 58, risk: 3.58, timing: 'GOOD', setup: 'Momentum Continuation', volume: 2585, rsi: 61.78, price: 5212, note: 'Strong volume, healthy RSI, Near breakout level, Not overextended', conf: 35 },
    { sym: 'ERIS', src: 'MANUAL', verdict: 'Avoid', weighted: 60, srcScore: 58, risk: 5.3, timing: 'GOOD', setup: 'Momentum Continuation', volume: 103405, rsi: 62.49, price: 1448.4, note: 'Strong volume, healthy RSI, Near breakout level, Not overextended', conf: 35 },
    { sym: 'ARIHANTSUP', src: 'MANUAL', verdict: 'Avoid', weighted: 59, srcScore: 58, risk: 4.67, timing: 'GOOD', setup: 'Momentum Continuation', volume: 46900, rsi: 60.44, price: 270.8, note: 'Strong volume, healthy RSI, Near breakout level, Not overextended', conf: 35 },
    { sym: 'ARVINDFASN', src: 'MANUAL', verdict: 'Avoid', weighted: 60, srcScore: 58, risk: 0.8, timing: 'GOOD', setup: 'BREAKOUT READY', volume: 415460, rsi: 61.86, price: 484.05, note: 'Clean resistance breakout zone, institutional volume confirmed, controlled RSI, near…', conf: 35 },
    { sym: 'HDFCBANK', src: 'AI', verdict: 'Hold', weighted: 71, srcScore: 70, risk: 1.2, timing: 'GOOD', setup: 'Momentum Continuation', volume: 8392421, rsi: 58.2, price: 1672.5, note: 'Stable trend, healthy volume, supportive market context', conf: 62 },
    { sym: 'TATAPOWER', src: 'AI', verdict: 'Watch', weighted: 68, srcScore: 67, risk: 2.1, timing: 'GOOD', setup: 'BREAKOUT READY', volume: 3294018, rsi: 59.4, price: 412.8, note: 'Pulling out of consolidation; volume building', conf: 55 },
    { sym: 'INFY', src: 'AI', verdict: 'Hold', weighted: 66, srcScore: 65, risk: 1.5, timing: 'FAIR', setup: 'Momentum Continuation', volume: 5128301, rsi: 56.7, price: 1542.4, note: 'Mid-trend continuation, no edge breakout', conf: 50 },
    { sym: 'BHARTIARTL', src: 'MANUAL', verdict: 'Watch', weighted: 64, srcScore: 63, risk: 1.8, timing: 'GOOD', setup: 'BREAKOUT READY', volume: 6238942, rsi: 60.8, price: 1985.6, note: 'Clean resistance breakout zone, institutional volume confirmed', conf: 45 },
  ]);
  const [filter, setFilter] = useLocalStorage('hk_stockFilter', 'All');
  const [draft, setDraft] = useState({ sym: '', src: 'Manual', verdict: 'Watch', entry: '', target: '' });

  const filters = ['Best pick', 'Rank all', 'All', 'AI', 'Manual', 'Sync'];
  const shown = useMemo(() => {
    if (filter === 'All' || filter === 'Rank all') return [...picks].sort((a,b) => b.weighted - a.weighted);
    if (filter === 'Best pick') return [...picks].sort((a,b) => b.weighted - a.weighted).slice(0, 3);
    if (filter === 'AI') return picks.filter(p => p.src === 'AI');
    if (filter === 'Manual') return picks.filter(p => p.src === 'MANUAL');
    return picks;
  }, [picks, filter]);

  const top = [...picks].sort((a,b) => b.weighted - a.weighted)[0];

  const addStock = () => {
    if (!draft.sym.trim()) return;
    setPicks([{
      sym: draft.sym.toUpperCase().trim(),
      src: draft.src.toUpperCase(),
      verdict: draft.verdict,
      weighted: 60, srcScore: 60, risk: 2.0, timing: 'GOOD', setup: 'Momentum Continuation',
      volume: 0, rsi: 0, price: 0, note: 'Newly added — pending analysis', conf: 35,
    }, ...picks]);
    setDraft({ sym: '', src: 'Manual', verdict: 'Watch', entry: '', target: '' });
  };

  const removeStock = (sym) => setPicks(picks.filter(p => p.sym !== sym));

  const verdictColor = (v) => v === 'Buy' ? t.success : v === 'Hold' ? t.accent1 : v === 'Watch' ? t.warn : t.danger; // Avoid falls to danger

  return (
    <Panel
      label="Tomorrow's Picks"
      title={`${picks.length} stocks · top ${top.sym} (${top.weighted}/100)`}
      action={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px',
              fontSize: 11.5, fontWeight: 500,
              borderRadius: 7,
              background: filter === f ? hexToRgba(t.accent2, 0.2) : 'rgba(255,255,255,0.04)',
              border: filter === f ? `1px solid ${t.accent2}` : `1px solid ${t.border}`,
              color: filter === f ? t.accent2 : t.textDim,
            }}>{f}</button>
          ))}
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 1fr 1fr 80px', gap: 8, marginBottom: 20 }}>
        <TextInput value={draft.sym} onChange={(v) => setDraft({...draft, sym: v})} placeholder="Symbol" />
        <select
          value={draft.src}
          onChange={(e) => setDraft({...draft, src: e.target.value})}
          style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${t.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 13, color: t.text }}
        >
          <option>Manual</option><option>AI</option>
        </select>
        <TextInput value={draft.verdict} onChange={(v) => setDraft({...draft, verdict: v})} placeholder="Watch" />
        <TextInput value={draft.entry} onChange={(v) => setDraft({...draft, entry: v})} placeholder="Entry" />
        <TextInput value={draft.target} onChange={(v) => setDraft({...draft, target: v})} placeholder="Target" />
        <Btn variant="primary" onClick={addStock}>+ Add</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, overflow: 'hidden' }}>
        {shown.map(p => {
          const vc = verdictColor(p.verdict);
          return (
            <div key={p.sym} style={{
              padding: 16,
              background: 'rgba(0,0,0,0.25)',
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.02em', color: '#f0f0f5' }}>{p.sym}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: p.src === 'AI' ? t.accent2 : t.warn, letterSpacing: '0.1em', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>{p.src}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: vc }} />
                <span style={{ color: vc }}>{p.verdict}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: t.textMute, letterSpacing: '0.15em' }}>WEIGHTED</span>
                <span className="mono" style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '2px 8px',
                  background: hexToRgba(t.accent2, 0.18),
                  border: `1px solid ${hexToRgba(t.accent2, 0.35)}`,
                  borderRadius: 5,
                  color: t.accent2,
                }}>{p.weighted}/100</span>
                <span style={{ flex: 1 }} />
                <button style={{ fontSize: 9.5, padding: '3px 7px', background: hexToRgba(t.accent1, 0.1), border: `1px solid ${hexToRgba(t.accent1, 0.25)}`, borderRadius: 4, color: t.accent1, fontWeight: 700, letterSpacing: '0.1em' }}>WHY?</button>
              </div>
              <Row label="Price" val={p.price.toLocaleString('en-IN')} />
              <Row label="Source score" val={`${p.srcScore}/100`} />
              <Row label="Risk" val={p.risk} />
              <Row label="Timing" val={p.timing} valColor={t.success} />
              <Row label="Setup" val={p.setup} small />
              <Row label="Volume" val={p.volume.toLocaleString('en-IN')} />
              <Row label="RSI" val={p.rsi.toFixed(2)} />
              <div style={{ fontSize: 11, color: t.textDim, lineHeight: 1.5, marginTop: 4, wordBreak: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {p.note}
              </div>
              <div style={{ fontSize: 10, color: t.textMute, fontWeight: 600 }}>GS AI confidence below {p.conf}%</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                <button style={{ padding: '7px 8px', background: hexToRgba(t.accent1, 0.1), border: `1px solid ${hexToRgba(t.accent1, 0.3)}`, borderRadius: 6, color: t.accent1, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>OPEN CHART</button>
                <button onClick={() => removeStock(p.sym)} style={{ padding: '7px 8px', background: hexToRgba(t.danger, 0.1), border: `1px solid ${hexToRgba(t.danger, 0.3)}`, borderRadius: 6, color: t.danger, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>REMOVE</button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Row({ label, val, valColor, small }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: small ? 10 : 11 }}>
      <span style={{ color: t.textDim, flexShrink: 0, flexBasis: 'auto' }}>{label}</span>
      <span className="mono" style={{ color: valColor || t.text, fontWeight: 500, textAlign: 'right', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 8 }}>{val}</span>
    </div>
  );
}

window.Stocks = Stocks;
