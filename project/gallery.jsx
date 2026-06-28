// Gallery & Files
function Gallery() {
  const t = useTheme();
  const [albums, setAlbums] = useLocalStorage('hk_albums', [
    { id: 1, name: 'Default', count: 3, locked: false, active: true, size: 181.8 },
    { id: 2, name: 'Trash', count: 0, locked: true, active: false, size: 0 },
    { id: 3, name: 'IT-Aaadmic', count: 2, locked: false, active: false, size: 124.4 },
    { id: 4, name: 'My Pics', count: 2, locked: false, active: false, size: 8200 },
    { id: 5, name: 'Boards English', count: 12, locked: false, active: false, size: 4100 },
    { id: 6, name: 'Refs 2026', count: 6, locked: false, active: false, size: 920 },
  ]);
  const [draft, setDraft] = useState('');
  const [draggingOver, setDraggingOver] = useState(false);

  const activeAlbum = albums.find(a => a.active) || albums[0];

  const setActive = (id) => setAlbums(albums.map(a => ({ ...a, active: a.id === id })));
  const removeAlbum = (id) => setAlbums(albums.filter(a => a.id !== id));
  const addAlbum = () => {
    if (!draft.trim()) return;
    setAlbums([...albums, { id: Date.now(), name: draft.trim(), count: 0, locked: false, active: false, size: 0 }]);
    setDraft('');
  };

  const fmt = (kb) => kb > 1024 ? (kb/1024).toFixed(1) + ' MB' : kb.toFixed(1) + ' KB';

  return (
    <Panel
      label="Gallery & Files"
      title={`${activeAlbum.name} — ${activeAlbum.count} file${activeAlbum.count !== 1 ? 's' : ''}`}
      action={<Btn variant="ghost">Upload</Btn>}
    >
      <div style={{ fontSize: 13, color: t.textDim, marginTop: -10, marginBottom: 20 }}>{fmt(activeAlbum.size)}</div>

      <TextInput value={draft} onChange={setDraft} placeholder="New album/folder name" onKeyDown={(e) => e.key === 'Enter' && addAlbum()} style={{ marginBottom: 16 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        {albums.map(a => (
          <button key={a.id} onClick={() => setActive(a.id)} style={{
            position: 'relative',
            textAlign: 'left',
            padding: '14px 16px',
            borderRadius: 11,
            background: a.active
              ? `linear-gradient(135deg, ${hexToRgba(t.accent2, 0.22)}, ${hexToRgba(t.accent2, 0.08)})`
              : 'rgba(255,255,255,0.025)',
            border: a.active
              ? `1px solid ${hexToRgba(t.accent2, 0.5)}`
              : `1px solid ${t.border}`,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', fontWeight: 700, color: a.locked ? t.warn : t.accent1, marginBottom: 6 }}>
              {a.locked ? 'LOCKED' : 'ALBUM'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{a.name}</span>
              {a.locked ? (
                <span style={{ fontSize: 13, color: t.textMute }}>•••</span>
              ) : (
                <span className="mono" style={{ fontSize: 13, color: t.textDim, fontWeight: 600 }}>{a.count}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={(e) => { e.preventDefault(); setDraggingOver(false); }}
        style={{
          border: `1px dashed ${draggingOver ? t.accent1 : t.borderStrong}`,
          borderRadius: 12,
          padding: '24px',
          textAlign: 'center',
          background: draggingOver ? hexToRgba(t.accent1, 0.05) : 'rgba(0,0,0,0.18)',
          color: t.textDim,
          fontSize: 13,
          transition: 'all 0.15s',
        }}>
        <span style={{ color: t.accent1, marginRight: 6 }}>↓</span>
        Drag & drop files here · or paste images from clipboard
      </div>

      {/* Thumbnails */}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {Array.from({ length: activeAlbum.count }).map((_, i) => (
          <div key={i} style={{
            aspectRatio: '4/3',
            background: `linear-gradient(135deg, ${hexToRgba(t.accent1, 0.18)}, ${hexToRgba(t.accent2, 0.18)})`,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            display: 'grid', placeItems: 'center',
            color: t.textDim, fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}>
            file-{String(i+1).padStart(2,'0')}.png
          </div>
        ))}
      </div>
    </Panel>
  );
}

window.Gallery = Gallery;
