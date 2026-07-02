import { useState, useEffect } from 'react';

interface Route { id: string; name: string; }
interface Row { name: string; phone: string; }

const BACKEND = 'https://transtrack-backend.onrender.com';

function getToken(): string {
  try { const t = localStorage.getItem('transtrack_tokens'); return t ? JSON.parse(t).accessToken : ''; }
  catch { return ''; }
}

function makeRows(n = 15): Row[] {
  return Array.from({ length: n }, () => ({ name: '', phone: '' }));
}

export function ImportPage() {
  const [routes, setRoutes]     = useState<Route[]>([]);
  const [routeId, setRouteId]   = useState('');
  const [rows, setRows]         = useState<Row[]>(makeRows());
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState('');
  const [isErr, setIsErr]       = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/routes`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => { if (d.routes) setRoutes(d.routes); }).catch(() => {});
  }, []);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const lines = e.clipboardData.getData('text').trim().split('\n').filter(Boolean);
    const parsed: Row[] = lines.map(l => {
      const parts = l.split('\t');
      return { name: (parts[0] ?? '').trim(), phone: (parts[1] ?? '').trim() };
    });
    // Skip header row if it looks like a header
    const skip = /name|student|s\.?no/i.test(parsed[0]?.name ?? '') ? 1 : 0;
    const data = parsed.slice(skip).filter(r => r.name);
    setRows([...data, ...makeRows(10)]);
    setMsg(`✅ ${data.length} rows pasted. Review below then click Save.`);
    setIsErr(false);
  }

  function update(idx: number, field: keyof Row, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  async function handleSave() {
    if (!routeId) { setMsg('Please select a route first.'); setIsErr(true); return; }
    const valid = rows.filter(r => r.name.trim());
    if (!valid.length) { setMsg('No student names entered yet.'); setIsErr(true); return; }
    setBusy(true); setMsg(''); setIsErr(false);
    try {
      const res = await fetch(`${BACKEND}/import/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ routeId, rows: valid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`✅ ${data.message}`);
      setIsErr(false);
      setRows(makeRows());
      setRouteId('');
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Failed'}`);
      setIsErr(true);
    } finally { setBusy(false); }
  }

  const filled    = rows.filter(r => r.name.trim()).length;
  const routeName = routes.find(r => r.id === routeId)?.name ?? '';

  const inp = (val: string, onChange: (v: string) => void, ph = '', mono = false): React.CSSProperties => ({
    width: '100%', padding: '9px 10px', border: 'none', fontSize: 13,
    color: '#0B1220', background: 'transparent', outline: 'none',
    fontFamily: mono ? 'monospace' : 'inherit',
  });

  return (
    <div style={{ padding: 32, maxWidth: 860, fontFamily: 'Inter, system-ui, sans-serif' }}>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>Add Students in Bulk</h1>
      <p style={{ fontSize: 14, color: '#64748B', marginBottom: 28 }}>
        Select a route, paste from your Excel, or type names directly. Parent accounts are created automatically using the mobile number.
      </p>

      {/* Route selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase' }}>Step 1 — Select Route</label>
        <select value={routeId} onChange={e => { setRouteId(e.target.value); setMsg(''); }}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 14, color: '#0B1220', minWidth: 300, outline: 'none', cursor: 'pointer', background: routeId ? '#F0FDF4' : 'white', borderColor: routeId ? '#86EFAC' : '#CBD5E1' }}>
          <option value="">— Choose a route —</option>
          {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {routeId && <span style={{ marginLeft: 10, fontSize: 13, color: '#16A34A', fontWeight: 600 }}>✓ {routeName}</span>}
      </div>

      {/* Paste box */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 4 }}>
          Step 2 — Paste from Excel (fastest)
        </p>
        <p style={{ fontSize: 13, color: '#1E40AF', marginBottom: 10 }}>
          In your Excel file, select the <strong>Name</strong> column and <strong>Contact Number</strong> column together → Ctrl+C → click the box below → Ctrl+V
        </p>
        <textarea
          onPaste={handlePaste}
          placeholder="Click here then press Ctrl+V to paste from Excel…"
          rows={3}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #BFDBFE', fontSize: 13, color: '#0B1220', resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: 'white' }}
        />
        <p style={{ fontSize: 11, color: '#93C5FD', marginTop: 4 }}>
          Or type directly in the table below
        </p>
      </div>

      {/* Status message */}
      {msg && (
        <div style={{ background: isErr ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${isErr ? '#FECACA' : '#BBF7D0'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: isErr ? '#DC2626' : '#166534', display: 'flex', justifyContent: 'space-between' }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Entry table */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>#</div>
          <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', borderLeft: '1px solid #E2E8F0' }}>Student Name *</div>
          <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', borderLeft: '1px solid #E2E8F0' }}>Parent Mobile Number</div>
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          {rows.map((row, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', borderBottom: idx < rows.length - 1 ? '1px solid #F8FAFC' : 'none', background: row.name ? '#FFFFFE' : '#FAFAFA' }}>
              <div style={{ padding: '2px 12px', fontSize: 12, color: '#CBD5E1', display: 'flex', alignItems: 'center', fontFamily: 'monospace' }}>{idx + 1}</div>
              <div style={{ borderLeft: '1px solid #F1F5F9' }}>
                <input
                  value={row.name}
                  onChange={e => update(idx, 'name', e.target.value)}
                  placeholder={idx === 0 ? 'e.g. Rohan Kumar' : ''}
                  style={inp(row.name, v => update(idx, 'name', v))}
                />
              </div>
              <div style={{ borderLeft: '1px solid #F1F5F9' }}>
                <input
                  value={row.phone}
                  onChange={e => update(idx, 'phone', e.target.value)}
                  placeholder={idx === 0 ? 'e.g. 9110532839' : ''}
                  style={{ ...inp(row.phone, v => update(idx, 'phone', v)), fontFamily: 'monospace' }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add more */}
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 16px' }}>
          <button onClick={() => setRows(p => [...p, ...makeRows(10)])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2563EB', fontWeight: 600 }}>
            + Add 10 more rows
          </button>
        </div>
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 20px' }}>
        <p style={{ fontSize: 14, color: filled > 0 && routeId ? '#0B1220' : '#94A3B8' }}>
          {filled > 0 && routeId
            ? <><strong style={{ color: '#2563EB' }}>{filled} student{filled !== 1 ? 's' : ''}</strong> ready to save to <strong>{routeName}</strong></>
            : !routeId ? 'Select a route above first' : 'Enter student names above'}
        </p>
        <button
          onClick={handleSave}
          disabled={busy || filled === 0 || !routeId}
          style={{ padding: '10px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: busy || !filled || !routeId ? 'not-allowed' : 'pointer', background: busy || !filled || !routeId ? '#CBD5E1' : '#16A34A', color: 'white', transition: 'background 0.2s' }}>
          {busy ? 'Saving…' : `Save ${filled || ''} Students`}
        </button>
      </div>
    </div>
  );
}
