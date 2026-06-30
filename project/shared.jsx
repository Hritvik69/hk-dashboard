// Shared components, hooks, and theme tokens
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ------ Theme presets ------
const THEME_PRESETS = {
  original: {
    name: 'Original',
    bg: '#0a0e1a',
    bgPanel: '#0f1424',
    bgPanelAlt: '#141a2e',
    border: 'rgba(255,255,255,0.06)',
    borderStrong: 'rgba(255,255,255,0.12)',
    text: '#e6e9f2',
    textDim: '#8b93ad',
    textMute: '#5b6280',
    accent1: '#5eead4',      // teal
    accent2: '#a78bfa',      // purple
    accentSolid: '#7dd3fc',
    danger: '#f43f5e',
    warn: '#f59e0b',
    success: '#10b981',
  },
  refined: {
    name: 'Refined',
    bg: '#08080c',
    bgPanel: '#0e0e14',
    bgPanelAlt: '#13131c',
    border: 'rgba(255,255,255,0.05)',
    borderStrong: 'rgba(255,255,255,0.1)',
    text: '#f0f0f5',
    textDim: '#7a7d8f',
    textMute: '#4a4d5e',
    accent1: '#22d3ee',
    accent2: '#22d3ee',
    accentSolid: '#22d3ee',
    danger: '#ef4444',
    warn: '#eab308',
    success: '#10b981',
  },
  editorial: {
    name: 'Editorial',
    bg: '#14110f',
    bgPanel: '#1c1814',
    bgPanelAlt: '#231e19',
    border: 'rgba(255,220,180,0.08)',
    borderStrong: 'rgba(255,220,180,0.16)',
    text: '#f5ede0',
    textDim: '#a89884',
    textMute: '#6b6052',
    accent1: '#f59e0b',
    accent2: '#fb923c',
    accentSolid: '#f59e0b',
    danger: '#ef4444',
    warn: '#eab308',
    success: '#84cc16',
  },
};

// ------ useLocalStorage hook ------
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return typeof initial === 'function' ? initial() : initial;
      return JSON.parse(raw);
    } catch {
      return typeof initial === 'function' ? initial() : initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

// ------ Theme context ------
const ThemeCtx = createContext(THEME_PRESETS.original);
const useTheme = () => useContext(ThemeCtx);

// ------ Panel / Card ------
function Panel({ children, style, className, label, title, action, padding = 28, ...rest }) {
  const t = useTheme();
  return (
    <section
      className={className}
      style={{
        background: `linear-gradient(180deg, ${t.bgPanel} 0%, ${t.bgPanelAlt} 100%)`,
        border: `1px solid ${t.border}`,
        borderRadius: 18,
        padding,
        position: 'relative',
        ...style,
      }}
      {...rest}
    >
      {(label || title || action) && (
        <header style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            {label && (
              <div style={{
                fontSize: 11, letterSpacing: '0.18em', fontWeight: 600,
                color: t.accent1, textTransform: 'uppercase', marginBottom: 6,
              }}>{label}</div>
            )}
            {title && (
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: t.text }}>{title}</h2>
            )}
          </div>
          {action && <div>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ------ Button ------
function Btn({ children, onClick, variant = 'default', size = 'md', style, ...rest }) {
  const t = useTheme();
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 12, borderRadius: 8 },
    md: { padding: '9px 16px', fontSize: 13, borderRadius: 10 },
    lg: { padding: '12px 20px', fontSize: 14, borderRadius: 12 },
  };
  const variants = {
    default: {
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${t.borderStrong}`,
      color: t.text,
    },
    primary: {
      background: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
      border: 'none',
      color: '#08080c',
      fontWeight: 600,
    },
    accent: {
      background: 'rgba(167,139,250,0.12)',
      border: `1px solid ${t.accent2}`,
      color: t.accent2,
      fontWeight: 600,
    },
    danger: {
      background: 'rgba(244,63,94,0.1)',
      border: `1px solid rgba(244,63,94,0.4)`,
      color: t.danger,
      fontWeight: 600,
    },
    ghost: {
      background: 'transparent',
      border: `1px solid ${t.border}`,
      color: t.textDim,
    },
  };
  return (
    <button
      onClick={onClick}
      style={{
        ...sizes[size],
        ...variants[variant],
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'brightness(1)'; }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------ Input ------
function TextInput({ value, onChange, placeholder, style, mono, onKeyDown, ...rest }) {
  const t = useTheme();
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: '11px 14px',
        fontSize: 13.5,
        width: '100%',
        color: t.text,
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
        transition: 'border 0.15s',
        ...style,
      }}
      onFocus={(e) => e.currentTarget.style.borderColor = t.accent1}
      onBlur={(e) => e.currentTarget.style.borderColor = t.border}
      {...rest}
    />
  );
}

// ------ Section label (small caps top label) ------
function SectionLabel({ children, color }) {
  const t = useTheme();
  return (
    <div style={{
      fontSize: 11,
      letterSpacing: '0.18em',
      fontWeight: 600,
      color: color || t.accent1,
      textTransform: 'uppercase',
      marginBottom: 8,
    }}>{children}</div>
  );
}

// ------ Pill ------
function Pill({ children, color, bg, style }) {
  const t = useTheme();
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '4px 10px',
      borderRadius: 6,
      background: bg || 'rgba(255,255,255,0.06)',
      color: color || t.textDim,
      fontFamily: 'JetBrains Mono, monospace',
      ...style,
    }}>{children}</span>
  );
}

// ------ Progress bar ------
function ProgressBar({ value, max = 100, height = 8, style }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{
      width: '100%',
      height,
      background: 'rgba(255,255,255,0.06)',
      borderRadius: height / 2,
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${t.accent1}, ${t.accent2})`,
        borderRadius: height / 2,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

// Tiny gradient accent text
function Gradient({ children, style }) {
  const t = useTheme();
  return (
    <span style={{
      backgroundImage: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      ...style,
    }}>{children}</span>
  );
}

// Color helpers — convert hex to rgba
function hexToRgba(hex, a = 1) {
  const m = hex.replace('#','');
  const r = parseInt(m.slice(0,2),16), g = parseInt(m.slice(2,4),16), b = parseInt(m.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ------ Landing Page (Cloud Sync Password Gate) ------
function LandingPage({ onUnlock, siteUrl, accessKey }) {
  const t = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the access key');
      return;
    }

    // If no access key configured, just unlock
    if (!accessKey) {
      onUnlock();
      return;
    }

    setLoading(true);
    setError('');

    // Validate against server if access key is configured
    try {
      const res = await fetch(`${siteUrl}/api/state`, {
        headers: { 'X-Access-Key': password }
      });
      if (res.ok || password === accessKey) {
        sessionStorage.setItem('hk_access_key', password);
        onUnlock();
      } else {
        setError('Invalid access key');
      }
    } catch {
      // Fallback: check against env key
      if (password === accessKey) {
        sessionStorage.setItem('hk_access_key', password);
        onUnlock();
      } else {
        setError('Invalid access key');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${t.bg} 0%, ${t.bgPanel} 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: t.bgPanel,
        border: `1px solid ${t.border}`,
        borderRadius: 20,
        padding: 40,
        textAlign: 'center',
        boxShadow: `0 25px 60px rgba(0,0,0,0.4)`,
      }}>
        {/* Logo */}
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 28, color: '#08080c',
          margin: '0 auto 24px',
          boxShadow: `0 12px 32px ${hexToRgba(t.accent2, 0.35)}`,
        }}>HK</div>

        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>HK Dashboard</h1>
        <p style={{ fontSize: 13, color: t.textDim, marginBottom: 28 }}>
          {accessKey ? 'Enter your access key to continue' : 'Click below to access your dashboard'}
        </p>

        {accessKey ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access key..."
              autoFocus
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${error ? t.danger : t.border}`,
                borderRadius: 12,
                padding: '14px 16px',
                fontSize: 15,
                color: t.text,
                textAlign: 'center',
                letterSpacing: '0.1em',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = t.accent1}
              onBlur={(e) => e.target.style.borderColor = error ? t.danger : t.border}
            />
            {error && (
              <div style={{ fontSize: 12, color: t.danger }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
                border: 'none',
                borderRadius: 12,
                padding: '14px 24px',
                fontSize: 14,
                fontWeight: 600,
                color: '#08080c',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Verifying...' : 'Unlock Dashboard'}
            </button>
          </form>
        ) : (
          <button
            onClick={onUnlock}
            style={{
              background: `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`,
              border: 'none',
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#08080c',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s',
            }}
          >
            Enter Dashboard
          </button>
        )}

        <div style={{
          marginTop: 28,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          fontSize: 11.5,
          color: t.textMute,
          lineHeight: 1.6,
        }}>
          Your data is stored locally and optionally synced to the cloud.
          {accessKey && ' Enter your access key to sync across devices.'}
        </div>
      </div>
    </div>
  );
}

// Export to window
Object.assign(window, {
  THEME_PRESETS, useLocalStorage, ThemeCtx, useTheme,
  Panel, Btn, TextInput, SectionLabel, Pill, ProgressBar, Gradient, hexToRgba, LandingPage,
});
