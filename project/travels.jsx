// Travels — Future destination locations with coordinates
function Travels() {
  const t = useTheme();
  const [destinations, setDestinations] = useLocalStorage('hk_travels', [
    { id: 1, name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, notes: 'Cherry blossom season', priority: 'high' },
    { id: 2, name: 'Reykjavik', country: 'Iceland', lat: 64.1466, lng: -21.9426, notes: 'Northern lights trip', priority: 'medium' },
    { id: 3, name: 'Cape Town', country: 'South Africa', lat: -33.9249, lng: 18.4241, notes: 'Table Mountain & beaches', priority: 'low' },
  ]);
  const [draft, setDraft] = useState({ name: '', country: '', lat: '', lng: '', notes: '', priority: 'medium' });
  const [view, setView] = useState('grid'); // grid | list

  const addDestination = () => {
    if (!draft.name.trim()) return;
    const newDest = {
      id: Date.now(),
      name: draft.name.trim(),
      country: draft.country.trim() || 'Unknown',
      lat: draft.lat ? parseFloat(draft.lat) : 0,
      lng: draft.lng ? parseFloat(draft.lng) : 0,
      notes: draft.notes.trim(),
      priority: draft.priority,
    };
    setDestinations([...destinations, newDest]);
    setDraft({ name: '', country: '', lat: '', lng: '', notes: '', priority: 'medium' });
  };

  const removeDestination = (id) => setDestinations(destinations.filter(d => d.id !== id));

  const priorityColor = (p) => {
    if (p === 'high') return t.danger;
    if (p === 'medium') return t.warn;
    return t.success;
  };

  const copyCoords = (lat, lng) => {
    navigator.clipboard.writeText(`${lat}, ${lng}`);
  };

  return (
    <Panel
      label="Wanderlust"
      title={`${destinations.length} future destinations`}
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('grid')} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8,
            background: view === 'grid' ? hexToRgba(t.accent2, 0.2) : 'rgba(255,255,255,0.04)',
            border: view === 'grid' ? `1px solid ${t.accent2}` : `1px solid ${t.border}`,
            color: view === 'grid' ? t.accent2 : t.textDim, cursor: 'pointer',
          }}>Grid</button>
          <button onClick={() => setView('list')} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8,
            background: view === 'list' ? hexToRgba(t.accent2, 0.2) : 'rgba(255,255,255,0.04)',
            border: view === 'list' ? `1px solid ${t.accent2}` : `1px solid ${t.border}`,
            color: view === 'list' ? t.accent2 : t.textDim, cursor: 'pointer',
          }}>List</button>
        </div>
      }
    >
      {/* Add new destination */}
      <div style={{
        padding: 18, marginBottom: 20,
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${t.border}`,
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.textDim, marginBottom: 14, letterSpacing: '0.08em' }}>ADD DESTINATION</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <TextInput value={draft.name} onChange={(v) => setDraft({...draft, name: v})} placeholder="City / Place" />
          <TextInput value={draft.country} onChange={(v) => setDraft({...draft, country: v})} placeholder="Country" />
          <TextInput value={draft.lat} onChange={(v) => setDraft({...draft, lat: v})} placeholder="Latitude" mono style={{ fontFamily: 'JetBrains Mono, monospace' }} />
          <TextInput value={draft.lng} onChange={(v) => setDraft({...draft, lng: v})} placeholder="Longitude" mono style={{ fontFamily: 'JetBrains Mono, monospace' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
          <TextInput value={draft.notes} onChange={(v) => setDraft({...draft, notes: v})} placeholder="Notes / plans" />
          <select
            value={draft.priority}
            onChange={(e) => setDraft({...draft, priority: e.target.value})}
            style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${t.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 13, color: t.text }}
          >
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <Btn variant="primary" onClick={addDestination}>Add Destination</Btn>
        </div>
      </div>

      {/* Destinations display */}
      {destinations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✈</div>
          <div style={{ fontSize: 14 }}>No destinations yet — add your first dream location above</div>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {destinations.map(d => (
            <div key={d.id} style={{
              padding: 18,
              background: 'rgba(0,0,0,0.25)',
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f0f0f5' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>{d.country}</div>
                </div>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                  padding: '4px 8px', borderRadius: 5,
                  background: hexToRgba(priorityColor(d.priority), 0.15),
                  border: `1px solid ${hexToRgba(priorityColor(d.priority), 0.4)}`,
                  color: priorityColor(d.priority),
                }}>{d.priority.toUpperCase()}</span>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: t.textMute, letterSpacing: '0.15em', marginBottom: 3 }}>LATITUDE</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: d.lat ? t.text : t.textMute }}>{d.lat ? d.lat.toFixed(4) : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: t.textMute, letterSpacing: '0.15em', marginBottom: 3 }}>LONGITUDE</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: d.lng ? t.text : t.textMute }}>{d.lng ? d.lng.toFixed(4) : '—'}</div>
                </div>
              </div>

              {d.notes && (
                <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                  {d.notes}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => copyCoords(d.lat, d.lng)}
                  style={{
                    padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    background: hexToRgba(t.accent1, 0.1), border: `1px solid ${hexToRgba(t.accent1, 0.3)}`,
                    borderRadius: 7, color: t.accent1, cursor: 'pointer',
                  }}
                >
                  COPY COORDS
                </button>
                <button
                  onClick={() => removeDestination(d.id)}
                  style={{
                    padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    background: hexToRgba(t.danger, 0.1), border: `1px solid ${hexToRgba(t.danger, 0.3)}`,
                    borderRadius: 7, color: t.danger, cursor: 'pointer',
                  }}
                >
                  REMOVE
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {destinations.map(d => (
            <div key={d.id} style={{
              padding: '14px 18px',
              background: 'rgba(0,0,0,0.2)',
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                padding: '4px 8px', borderRadius: 5, minWidth: 60, textAlign: 'center',
                background: hexToRgba(priorityColor(d.priority), 0.15),
                border: `1px solid ${hexToRgba(priorityColor(d.priority), 0.4)}`,
                color: priorityColor(d.priority),
              }}>{d.priority.toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f5' }}>{d.name}</div>
                <div style={{ fontSize: 12, color: '#a1a1aa' }}>{d.country}</div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: t.textDim }}>
                {d.lat ? d.lat.toFixed(4) : '—'}, {d.lng ? d.lng.toFixed(4) : '—'}
              </div>
              {d.notes && <div style={{ fontSize: 12, color: t.textMute, maxWidth: 200 }}>{d.notes}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => copyCoords(d.lat, d.lng)} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, background: hexToRgba(t.accent1, 0.1), border: `1px solid ${hexToRgba(t.accent1, 0.3)}`, borderRadius: 6, color: t.accent1, cursor: 'pointer' }}>COPY</button>
                <button onClick={() => removeDestination(d.id)} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, background: hexToRgba(t.danger, 0.1), border: `1px solid ${hexToRgba(t.danger, 0.3)}`, borderRadius: 6, color: t.danger, cursor: 'pointer' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

window.Travels = Travels;
