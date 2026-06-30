// Top-level App: sidebar nav, tabs, Tweaks panel, AI helper
function App() {
  // Theme + tweaks (defaults live in EDITMODE block at bottom of file)
  const [t, setTweak] = useTweaks(window.__HK_TWEAK_DEFAULTS || {
    preset: 'original', owner: 'HK', density: 'comfy', accentOverride: 'default',
  });

  // Cloud sync / access key check
  const [unlocked, setUnlocked] = useState(false);
  const config = window.HK_CONFIG || {};
  const accessKey = config.DASHBOARD_ACCESS_KEY;
  const hasAccessKey = accessKey != null && accessKey !== '';
  const siteUrl = config.SITE_URL;

  // Skip landing if already unlocked (sessionStorage check for when access key IS configured)
  useEffect(() => {
    if (hasAccessKey) {
      const saved = sessionStorage.getItem('hk_access_key');
      if (saved === accessKey) {
        setUnlocked(true);
      }
    }
  }, [accessKey, hasAccessKey]);

  const handleUnlock = () => {
    if (!hasAccessKey) {
      // No password set — just unlock
      setUnlocked(true);
    }
  };

  // Show landing page if not unlocked
  if (!unlocked) {
    return (
      <ThemeCtx.Provider value={THEME_PRESETS.original}>
        <LandingPage
          onUnlock={handleUnlock}
          siteUrl={siteUrl}
          accessKey={accessKey}
        />
      </ThemeCtx.Provider>
    );
  }

  const theme = useMemo(() => {
    const base = { ...(THEME_PRESETS[t.preset] || THEME_PRESETS.original) };
    if (t.accentOverride === 'cyan') { base.accent1 = '#22d3ee'; base.accent2 = '#22d3ee'; }
    else if (t.accentOverride === 'amber') { base.accent1 = '#f59e0b'; base.accent2 = '#fb923c'; }
    else if (t.accentOverride === 'green') { base.accent1 = '#22c55e'; base.accent2 = '#84cc16'; }
    return base;
  }, [t.preset, t.accentOverride]);

  // Apply CSS variables on body
  useEffect(() => {
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.documentElement.style.setProperty('--text', theme.text);
  }, [theme]);

  // Active section persistence
  const [active, setActive] = useLocalStorage('hk_activeSection', 'home');

  // AI helper
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMsgs, setAiMsgs] = useLocalStorage('hk_aiMsgs', []);
  const [aiBusy, setAiBusy] = useState(false);

  const sections = [
    { id: 'home', name: 'Home', icon: '◐', label: 'Today' },
    { id: 'growth', name: 'Growth', icon: '◈', label: 'Life dimensions' },
    { id: 'habits', name: 'Habits', icon: '◉', label: '30-day grid' },
    { id: 'travels', name: 'Travels', icon: '✈', label: 'Future destinations' },
    { id: 'gallery', name: 'Gallery', icon: '▦', label: 'Files & albums' },
    { id: 'stocks', name: 'Stocks', icon: '▲', label: 'Tomorrow\'s picks' },
    { id: 'storage', name: 'Storage', icon: '◰', label: 'Browser usage' },
  ];

  const density = { compact: 16, comfy: 24, cozy: 32 }[t.density] || 24;
  const containerPad = { compact: 18, comfy: 28, cozy: 36 }[t.density] || 28;

  const askAI = async () => {
    if (!aiInput.trim() || aiBusy) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMsgs(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiBusy(true);
    try {
      const reply = await window.genspark.complete({
        messages: [
          { role: 'system', content: 'You are a friendly productivity assistant inside HK\'s personal dashboard. Be concise, warm, helpful. Keep replies under 4 sentences.' },
          ...aiMsgs.slice(-6),
          { role: 'user', content: userMsg },
        ],
      });
      setAiMsgs(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setAiMsgs(prev => [...prev, { role: 'assistant', content: 'Hmm — I couldn\'t reach my brain right now. Try again in a sec.' }]);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '230px 1fr',
        background: theme.bg,
        color: theme.text,
      }}>
        {/* Sidebar */}
        <aside style={{
          padding: '28px 18px',
          borderRight: `1px solid ${theme.border}`,
          position: 'sticky', top: 0, height: '100vh',
          background: `linear-gradient(180deg, ${theme.bgPanel} 0%, ${theme.bg} 100%)`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px 22px' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${theme.accent1}, ${theme.accent2})`,
              display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 14, color: '#08080c', letterSpacing: '-0.04em',
            }}>{t.owner}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.owner} Dashboard</div>
              <div style={{ fontSize: 10, color: theme.textMute, letterSpacing: '0.14em', fontWeight: 600, marginTop: 1 }}>v3 · LOCAL</div>
            </div>
          </div>

          {sections.map(s => (
            <button key={s.id} onClick={() => setActive(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 12px', borderRadius: 9,
              background: active === s.id
                ? `linear-gradient(90deg, ${hexToRgba(theme.accent2, 0.18)}, transparent)`
                : 'transparent',
              border: active === s.id ? `1px solid ${hexToRgba(theme.accent2, 0.35)}` : `1px solid transparent`,
              textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => { if (active !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={(e) => { if (active !== s.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 7,
                background: active === s.id ? hexToRgba(theme.accent1, 0.2) : 'rgba(255,255,255,0.04)',
                color: active === s.id ? theme.accent1 : theme.textDim,
                display: 'grid', placeItems: 'center',
                fontSize: 13, fontWeight: 600,
              }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: active === s.id ? theme.text : theme.textDim }}>{s.name}</div>
                <div style={{ fontSize: 10.5, color: theme.textMute, marginTop: 1, letterSpacing: '0.02em' }}>{s.label}</div>
              </div>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <div style={{
            padding: 14, borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${theme.border}`,
            fontSize: 11, color: theme.textMute,
            lineHeight: 1.5,
          }}>
            All data persists locally via <span style={{ color: theme.accent1, fontFamily: 'JetBrains Mono', fontWeight: 600 }}>localStorage</span>. Toggle Tweaks to swap themes.
          </div>
        </aside>

        {/* Main */}
        <main style={{ padding: containerPad, display: 'flex', flexDirection: 'column', gap: density, maxWidth: 1400, margin: '0 auto', width: '100%' }} data-screen-label={`01 ${sections.find(s => s.id === active)?.name}`}>
          {active === 'home' && <Home />}
          {active === 'growth' && <Growth />}
          {active === 'habits' && <Habits />}
          {active === 'travels' && <Travels />}
          {active === 'gallery' && <Gallery />}
          {active === 'stocks' && <Stocks />}
          {active === 'storage' && <Storage />}
        </main>

        {/* AI helper button */}
        <button onClick={() => setAiOpen(o => !o)} style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 56, height: 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.accent1}, ${theme.accent2})`,
          border: 'none', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          boxShadow: `0 10px 30px ${hexToRgba(theme.accent2, 0.5)}, 0 0 0 4px ${hexToRgba(theme.accent1, 0.15)}`,
          fontWeight: 700, fontSize: 16, color: '#08080c',
          letterSpacing: '0.05em',
          zIndex: 50,
          transition: 'transform 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        title="AI Assistant"
        >AI</button>

        {/* AI panel */}
        {aiOpen && (
          <div style={{
            position: 'fixed', bottom: 96, right: 24,
            width: 380, maxHeight: '70vh',
            background: theme.bgPanel,
            border: `1px solid ${theme.borderStrong}`,
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            zIndex: 49,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: theme.accent1, fontWeight: 700, marginBottom: 2 }}>HK ASSISTANT</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>How can I help?</div>
              </div>
              <button onClick={() => setAiOpen(false)} style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: theme.textDim, fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aiMsgs.length === 0 && (
                <div style={{ color: theme.textDim, fontSize: 13, lineHeight: 1.5 }}>
                  Ask me anything about your dashboard, your day, your stock picks, or your habits. I keep it short and useful.
                </div>
              )}
              {aiMsgs.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '9px 13px',
                  borderRadius: 11,
                  fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? hexToRgba(theme.accent2, 0.2) : 'rgba(255,255,255,0.04)',
                  border: m.role === 'user' ? `1px solid ${hexToRgba(theme.accent2, 0.35)}` : `1px solid ${theme.border}`,
                  color: theme.text,
                  whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              ))}
              {aiBusy && <div style={{ color: theme.textDim, fontSize: 12 }}>thinking…</div>}
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${theme.border}`, display: 'flex', gap: 8 }}>
              <TextInput value={aiInput} onChange={setAiInput} placeholder="Ask the assistant…" onKeyDown={(e) => e.key === 'Enter' && askAI()} />
              <Btn variant="primary" size="md" onClick={askAI}>Send</Btn>
            </div>
          </div>
        )}

        {/* Tweaks panel */}
        <TweaksPanel>
          <TweakSection title="Style">
            <TweakSelect
              label="Preset"
              value={t.preset}
              onChange={(v) => setTweak('preset', v)}
              options={[
                { value: 'original', label: 'Original — navy + teal/purple' },
                { value: 'refined', label: 'Refined — mono cyan' },
                { value: 'editorial', label: 'Editorial — warm amber' },
              ]}
            />
            <TweakSelect
              label="Accent"
              value={t.accentOverride}
              onChange={(v) => setTweak('accentOverride', v)}
              options={[
                { value: 'default', label: 'Match preset' },
                { value: 'cyan', label: 'Cyan' },
                { value: 'amber', label: 'Amber' },
                { value: 'green', label: 'Green' },
              ]}
            />
            <TweakRadio
              label="Density"
              value={t.density}
              onChange={(v) => setTweak('density', v)}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfy', label: 'Comfy' },
                { value: 'cozy', label: 'Cozy' },
              ]}
            />
          </TweakSection>
          <TweakSection title="Identity">
            <TweakText
              label="Owner initials"
              value={t.owner}
              onChange={(v) => setTweak('owner', v.toUpperCase().slice(0, 3))}
            />
          </TweakSection>
          <TweakSuggestionBar suggestions={[
            "Make the radar chart larger and more dramatic",
            "Add a weather widget on the home page",
            "Use serif headings for an editorial feel",
            "Show more stock detail by default",
            "Add a focus timer / pomodoro to the home page"
          ]} />
        </TweaksPanel>
      </div>
    </ThemeCtx.Provider>
  );
}

// Persistent defaults (rewritten by host on tweak changes)
window.__HK_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "preset": "original",
  "owner": "HK",
  "density": "comfy",
  "accentOverride": "default"
}/*EDITMODE-END*/;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
