// Growth dashboard with radar chart + dimension cards
function Growth() {
  const t = useTheme();
  const [dims, setDims] = useLocalStorage('hk_growth', [
    { id: 'communication', name: 'Communication', icon: '💬', level: 77, tasks: 0 },
    { id: 'overall', name: 'Overall Skills', icon: '◆', level: 84, tasks: 0 },
    { id: 'personality', name: 'Personality', icon: '◉', level: 77, tasks: 2 },
    { id: 'emotions', name: 'Emotions', icon: '♥', level: 57, tasks: 0 },
    { id: 'knowledge', name: 'Knowledge', icon: '▦', level: 91, tasks: 0 },
    { id: 'problem', name: 'Problem Solving', icon: '✦', level: 85, tasks: 0 },
    { id: 'financial', name: 'Financial Skills', icon: '◐', level: 62, tasks: 1 },
  ]);

  const overall = Math.round(dims.reduce((s, d) => s + d.level, 0) / dims.length);

  const setLevel = (id, v) => setDims(dims.map(d => d.id === id ? { ...d, level: Math.max(0, Math.min(100, v)) } : d));

  // Radar geometry
  const size = 560;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.32;
  const angles = dims.map((_, i) => (-Math.PI / 2) + (i * 2 * Math.PI) / dims.length);

  const point = (i, lvl) => {
    const r = (lvl / 100) * radius;
    return [cx + Math.cos(angles[i]) * r, cy + Math.sin(angles[i]) * r];
  };
  const labelPos = (i) => {
    const r = radius + 56;
    return [cx + Math.cos(angles[i]) * r, cy + Math.sin(angles[i]) * r];
  };

  const dataPath = dims.map((d, i) => {
    const [x, y] = point(i, d.level);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ') + ' Z';

  // Grid rings
  const rings = [25, 50, 75, 100];

  // Drag handle on radar
  const svgRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  useEffect(() => {
    if (dragIdx === null) return;
    const handleMove = (e) => {
      const rect = svgRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // scale from screen to viewBox
      const sx = (px / rect.width) * size;
      const sy = (py / rect.height) * size;
      const dx = sx - cx, dy = sy - cy;
      // project onto axis
      const ax = Math.cos(angles[dragIdx]), ay = Math.sin(angles[dragIdx]);
      const dist = Math.max(0, Math.min(radius, dx * ax + dy * ay));
      const lvl = Math.round((dist / radius) * 100);
      setLevel(dims[dragIdx].id, lvl);
    };
    const handleUp = () => setDragIdx(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragIdx, dims]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Panel
        label="Personal Growth"
        title="Growth Dashboard"
        action={
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: hexToRgba(t.accent1, 0.15),
            border: `1px solid ${hexToRgba(t.accent1, 0.3)}`,
            display: 'grid', placeItems: 'center',
            color: t.accent1, fontWeight: 700, fontSize: 12, letterSpacing: '0.05em',
            fontFamily: 'JetBrains Mono, monospace',
          }}>GY</div>
        }
      >
        <p style={{ color: t.textDim, fontSize: 13.5, marginTop: -8, marginBottom: 20 }}>
          Track your progress across 7 dimensions of life. Drag the radar points or use each card's slider — everything saves automatically.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 520, display: 'block', userSelect: 'none' }}>
              <defs>
                <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={t.accent1} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={t.accent2} stopOpacity="0.15" />
                </radialGradient>
              </defs>
              {/* Grid rings */}
              {rings.map(r => (
                <polygon
                  key={r}
                  points={angles.map((a, i) => {
                    const rr = (r / 100) * radius;
                    return (cx + Math.cos(a) * rr) + ',' + (cy + Math.sin(a) * rr);
                  }).join(' ')}
                  fill="none"
                  stroke={hexToRgba(t.accent1, 0.12)}
                  strokeWidth="1"
                />
              ))}
              {/* Axes */}
              {angles.map((a, i) => (
                <line key={i}
                  x1={cx} y1={cy}
                  x2={cx + Math.cos(a) * radius}
                  y2={cy + Math.sin(a) * radius}
                  stroke={hexToRgba(t.accent1, 0.1)}
                  strokeWidth="1"
                />
              ))}
              {/* Data polygon */}
              <path d={dataPath} fill="url(#radarFill)" stroke={t.accent1} strokeWidth="2" />
              {/* Data points */}
              {dims.map((d, i) => {
                const [x, y] = point(i, d.level);
                return (
                  <circle key={d.id}
                    cx={x} cy={y} r="7"
                    fill={t.bg}
                    stroke={t.accent1}
                    strokeWidth="2.5"
                    style={{ cursor: 'grab' }}
                    onMouseDown={() => setDragIdx(i)}
                  />
                );
              })}
              {/* Labels */}
              {dims.map((d, i) => {
                const [x, y] = labelPos(i);
                const ta = Math.abs(Math.cos(angles[i])) < 0.2 ? 'middle' : (Math.cos(angles[i]) > 0 ? 'start' : 'end');
                return (
                  <g key={d.id}>
                    <text x={x} y={y - 2} fill={t.text} fontSize="13" fontWeight="600" textAnchor={ta} fontFamily="Space Grotesk">
                      {d.icon} {d.name}
                    </text>
                    <text x={x} y={y + 16} fill={t.accent1} fontSize="12" fontWeight="500" textAnchor={ta} fontFamily="JetBrains Mono">
                      Level {d.level}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div>
            <SectionLabel>Overall Life Progress</SectionLabel>
            <ProgressBar value={overall} height={10} style={{ marginTop: 12, marginBottom: 24 }} />
            <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>
              Overall Level: <Gradient>{overall} / 100</Gradient>
            </h2>
            <p style={{ color: t.textDim, marginTop: 8, fontSize: 14 }}>Average of all 7 dimensions.</p>

            <div style={{ marginTop: 24, padding: 18, background: 'rgba(0,0,0,0.25)', borderRadius: 12, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 11, color: t.textMute, letterSpacing: '0.15em', fontWeight: 600, marginBottom: 10 }}>STRONGEST DIMENSIONS</div>
              {[...dims].sort((a,b) => b.level - a.level).slice(0,3).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, whiteSpace: 'nowrap' }}>
                  <span>{d.icon} {d.name}</span>
                  <span className="mono" style={{ color: t.accent1 }}>{d.level}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* Dimension cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {dims.map(d => (
          <div key={d.id} style={{
            padding: 20,
            background: `linear-gradient(180deg, ${t.bgPanel}, ${t.bgPanelAlt})`,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 9,
                background: hexToRgba(t.accent1, 0.12),
                border: `1px solid ${hexToRgba(t.accent1, 0.25)}`,
                display: 'grid', placeItems: 'center',
                fontSize: 16, color: t.accent1,
              }}>{d.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>Level {d.level} · {d.tasks} open task{d.tasks !== 1 ? 's' : ''}</div>
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13, fontWeight: 600,
                padding: '5px 12px',
                background: hexToRgba(t.accent2, 0.15),
                border: `1px solid ${hexToRgba(t.accent2, 0.3)}`,
                borderRadius: 999,
                color: t.accent2,
              }}>{d.level}</div>
              <button onClick={() => setLevel(d.id, d.level + 1)} style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${t.borderStrong}`,
                color: t.text, fontSize: 16, fontWeight: 300,
                display: 'grid', placeItems: 'center',
              }}>+</button>
            </div>
            <input
              type="range" min="0" max="100" value={d.level}
              onChange={(e) => setLevel(d.id, +e.target.value)}
              style={{
                width: '100%',
                accentColor: t.accent1,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

window.Growth = Growth;
