import { useState, useEffect } from 'react';

interface Route { id: string; name: string; }
interface StudentRow { name: string; phone: string; }

const BACKEND = 'https://transtrack-backend.onrender.com';

function getToken(): string {
  try {
    const t = localStorage.getItem('transtrack_tokens');
    return t ? JSON.parse(t).accessToken : '';
  } catch { return ''; }
}

export function ImportPage() {
  const [routes, setRoutes]       = useState<Route[]>([]);
  const [routeId, setRouteId]     = useState('');
  const [rows, setRows]           = useState<StudentRow[]>(
    Array.from({ length: 10 }, () => ({ name: '', phone: '' }))
  );
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState('');
  const [isError, setIsError]     = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/routes`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => { if (d.routes) setRoutes(d.routes); })
      .catch(() => {});
  }, []);

  /* ── Paste handler ──────────────────────────────────────────────
     User copies two columns from Excel (Name | Phone) and pastes
     into the textarea. Each line becomes one student row.          */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const lines = text.trim().split('\n').filter(Boolean);
    const parsed: StudentRow[] = lines.map(line => {
      const parts = line.split('\t');
      return { name: (parts[0] ?? '').trim(), phone: (parts[1] ?? '').trim() };
    });
    // Skip header row if first row looks like a header
    const start = /name|student/i.test(parsed[0]?.name ?? '') ? 1 : 0;
    const data = parsed.slice(start);
    // Pad to at least 10 empty rows after pasted data
    const padded = [...data, ...Array.from({ length: 10 }, () => ({ name: '', phone: '' }))];
    setRows(padded);
    setMsg(`Pasted ${data.length} rows. Review below then click Import.`);
    setIsError(false);
  }

  function updateRow(idx: number, field: 'name' | 'phone', value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRows() {
    setRows(prev => [...prev, ...Array.from({ length: 10 }, () => ({ name: '', phone: '' }))]);
  }

  async function handleImport() {
    if (!routeId) { setMsg('Please select a route first.'); setIsError(true); return; }
    const valid = rows.filter(r => r.name.trim());
    if (valid.length === 0) { setMsg('No student names entered yet.'); setIsError(true); return; }

    setBusy(true); setMsg(''); setIsError(false);
    try {
      const res = await fetch(`${BACKEND}/import/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ routeId, rows: valid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setMsg(`✅ ${data.message}`);
      setIsError(false);
      setRows(Array.from({ length: 10 }, () => ({ name: '', phone: '' })));
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Import failed'}`);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const filled = rows.filter(r => r.name.trim()).length;
  const routeName = routes.find(r => r.id === routeId)?.name ?? '';

  return (
    <div style={{ padding: 32, maxWidth: 860, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 4 }}>
        Add Students
      </h1>
      <p style={{ fontSize: 14, color: '#64748B', marginBottom: 28 }}>
        Select a route, then enter or paste student details. Up to 50 students per route.
      </p>

      {/* Route selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>
          SELECT ROUTE
        </label>
        <select
          value={routeId}
          onChange={e => { setRouteId(e.target.value); setMsg(''); }}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 14, color: '#0B1220', width: 320, outline: 'none', cursor: 'pointer' }}
        >
          <option value="">— Choose a route —</option>
          {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* Paste helper */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8', marginBottom: 6 }}>
          💡 Paste from Excel (fastest way)
        </p>
        <p style={{ fontSize: 13, color: '#1E40AF', marginBottom: 10 }}>
          In your Excel file, select the <strong>Name</strong> and <strong>Contact Number</strong> columns together, copy them (Ctrl+C), then paste below:
        </p>
        <textarea
          placeholder="Paste Excel data here (Name + Phone columns)..."
          onPaste={handlePaste}
          rows={3}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #BFDBFE', fontSize: 13, color: '#0B1220', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Message */}
      {msg && (
        <div style={{ background: isError ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${isError ? '#FECACA' : '#BBF7D0'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: isError ? '#DC2626' : '#166534' }}>
          {msg}
        </div>
      )}

      {/* Student table */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '10px 16px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>#</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Student Name</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Parent Mobile Number</span>
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {rows.map((row, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 1fr',
                borderBottom: idx < rows.length - 1 ? '1px solid #F1F5F9' : 'none',
                background: row.name.trim() ? 'white' : '#FAFAFA',
              }}
            >
              <span style={{ fontSize: 12, color: '#CBD5E1', padding: '10px 16px', alignSelf: 'center', fontFamily: 'monospace' }}>
                {idx + 1}
              </span>
              <input
                value={row.name}
                onChange={e => updateRow(idx, 'name', e.target.value)}
                placeholder={idx === 0 ? 'e.g. Rohan' : ''}
                style={{
                  border: 'none', borderRight: '1px solid #F1F5F9', padding: '10px 12px',
                  fontSize: 14, color: '#0B1220', background: 'transparent', outline: 'none', width: '100%',
                }}
              />
              <input
                value={row.phone}
                onChange={e => updateRow(idx, 'phone', e.target.value)}
                placeholder={idx === 0 ? 'e.g. 9110532839' : ''}
                style={{
                  border: 'none', padding: '10px 12px', fontSize: 14,
                  color: '#0B1220', background: 'transparent', outline: 'none', width: '100%', fontFamily: 'monospace',
                }}
              />
            </div>
          ))}
        </div>

        {/* Add more rows */}
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 16px' }}>
          <button
            onClick={addRows}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2563EB', fontWeight: 600 }}
          >
            + Add 10 more rows
          </button>
        </div>
      </div>

      {/* Footer action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 20px' }}>
        <div>
          {filled > 0 && routeId ? (
            <p style={{ fontSize: 14, color: '#0B1220' }}>
              Ready to add <strong style={{ color: '#2563EB' }}>{filled} student{filled !== 1 ? 's' : ''}</strong>
              {routeName ? ` to ${routeName}` : ''}
            </p>
          ) : (
            <p style={{ fontSize: 14, color: '#94A3B8' }}>
              {!routeId ? 'Select a route above to continue' : 'Enter student names above'}
            </p>
          )}
        </div>
        <button
          onClick={handleImport}
          disabled={busy || filled === 0 || !routeId}
          style={{
            padding: '10px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600,
            cursor: busy || filled === 0 || !routeId ? 'not-allowed' : 'pointer',
            background: busy || filled === 0 || !routeId ? '#CBD5E1' : '#0B1220',
            color: 'white', transition: 'background 0.2s',
          }}
        >
          {busy ? 'Saving…' : `Save ${filled > 0 ? filled : ''} Students`}
        </button>
      </div>
    </div>
  );
}
