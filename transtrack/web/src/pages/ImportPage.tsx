import { useState, useRef, useEffect } from 'react';

declare global {
  interface Window { XLSX: any; }
}

interface ParsedRow {
  name: string;
  phone: string;
  boardingPoint?: string;
}

interface RouteOption {
  id: string;
  name: string;
}

function findCol(headers: string[], keywords: string[]): number {
  return headers.findIndex((h: string) =>
    keywords.some((kw) => String(h ?? '').toLowerCase().includes(kw.toLowerCase()))
  );
}

function parseSheet(worksheet: any): ParsedRow[] {
  if (!window.XLSX) return [];
  const json: any[][] = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (json.length < 2) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, json.length); i++) {
    if (json[i].some((c: any) => /name/i.test(String(c)))) { headerIdx = i; break; }
  }

  const headers = json[headerIdx].map((c: any) => String(c ?? ''));
  const nameCol  = findCol(headers, ['name', 'student']);
  const phoneCol = findCol(headers, ['contact', 'phone', 'mobile', 'number']);
  const boardCol = findCol(headers, ['boarding', 'stop', 'point', 'location']);

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < json.length; i++) {
    const row = json[i];
    const name  = String(nameCol  >= 0 ? (row[nameCol]  ?? '') : '').trim();
    const phone = String(phoneCol >= 0 ? (row[phoneCol] ?? '') : '').trim();
    if (!name && !phone) continue;
    rows.push({
      name,
      phone,
      boardingPoint: boardCol >= 0 ? String(row[boardCol] ?? '').trim() : undefined,
    });
  }
  return rows;
}

export function ImportPage() {
  const [ready, setReady]         = useState(false);
  const [routes, setRoutes]       = useState<RouteOption[]>([]);
  const [step, setStep]           = useState<'upload'|'assign'|'done'>('upload');
  const [fileName, setFileName]   = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [allRows, setAllRows]     = useState<Record<string, ParsedRow[]>>({});
  const [mapping, setMapping]     = useState<Record<string, string>>({});
  const [results, setResults]     = useState<string[]>([]);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Load SheetJS + routes
  useEffect(() => {
    // Load routes
    const tokens = localStorage.getItem('transtrack_tokens');
    if (tokens) {
      const { accessToken } = JSON.parse(tokens);
      fetch('/api/routes', { headers: { Authorization: `Bearer ${accessToken}` } })
        .catch(() => {});
      // Use relative path fallback — direct fetch to backend
      const backendUrl = (window as any).__VITE_API || 'https://transtrack-backend.onrender.com';
      fetch(`${backendUrl}/routes`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((r) => r.json())
        .then((d) => { if (d.routes) setRoutes(d.routes); })
        .catch(() => {});
    }

    // Load SheetJS
    if (window.XLSX) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => setReady(true);
    s.onerror = () => setError('Could not load Excel reader. Check your internet connection.');
    document.head.appendChild(s);
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.XLSX) { setError('Excel reader not loaded yet. Please wait a moment and try again.'); return; }
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onerror = () => setError('Could not read this file.');
    reader.onload = (evt) => {
      try {
        const wb = window.XLSX.read(evt.target?.result, { type: 'binary' });
        const names: string[] = wb.SheetNames;
        const rows: Record<string, ParsedRow[]> = {};
        names.forEach((n: string) => { rows[n] = parseSheet(wb.Sheets[n]); });

        const nonEmpty = names.filter((n) => rows[n].length > 0);
        if (nonEmpty.length === 0) {
          setError('No student data found. Make sure your Excel has columns for Name and Contact/Phone.');
          return;
        }

        setSheetNames(nonEmpty);
        setAllRows(rows);
        const m: Record<string, string> = {};
        nonEmpty.forEach((n) => { m[n] = ''; });
        setMapping(m);
        setStep('assign');
      } catch {
        setError('Could not parse this Excel file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleImport() {
    const toImport = sheetNames.filter((n) => mapping[n]);
    if (toImport.length === 0) { setError('Please assign at least one sheet to a route.'); return; }

    setBusy(true);
    setError('');
    const tokens = localStorage.getItem('transtrack_tokens');
    if (!tokens) { setError('Not logged in. Please refresh and log in again.'); setBusy(false); return; }
    const { accessToken } = JSON.parse(tokens);
    const backendUrl = 'https://transtrack-backend.onrender.com';
    const newResults: string[] = [];

    for (const sheetName of toImport) {
      const routeId = mapping[sheetName];
      const routeName = routes.find((r) => r.id === routeId)?.name ?? routeId;
      try {
        const res = await fetch(`${backendUrl}/import/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ routeId, rows: allRows[sheetName] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Import failed');
        newResults.push(`✓ "${sheetName}" → ${routeName}: ${data.message}`);
      } catch (err) {
        newResults.push(`✗ "${sheetName}": ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }

    setResults(newResults);
    setBusy(false);
    setStep('done');
  }

  function reset() {
    setStep('upload');
    setFileName('');
    setSheetNames([]);
    setAllRows({});
    setMapping({});
    setResults([]);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const totalStudents = sheetNames.filter((n) => mapping[n]).reduce((s, n) => s + allRows[n].length, 0);

  return (
    <div style={{ padding: '32px', maxWidth: '800px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0B1220', marginBottom: '4px' }}>
        Import Students from Excel
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '32px' }}>
        Upload your Excel file, assign it to a route, and all students and parent accounts are created automatically.
      </p>

      {!ready && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#64748B', fontSize: '14px' }}>
          Loading Excel reader…
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: '#DC2626', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '16px' }}>✕</button>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div
          onClick={() => ready && fileRef.current?.click()}
          style={{
            border: '2px dashed #CBD5E1', borderRadius: '16px', padding: '64px 32px',
            textAlign: 'center', cursor: ready ? 'pointer' : 'default',
            background: ready ? 'white' : '#F8FAFC',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { if (ready) (e.currentTarget as HTMLDivElement).style.borderColor = '#2563EB'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#CBD5E1'; }}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#0B1220', marginBottom: '8px' }}>
            {ready ? 'Click to upload your Excel file' : 'Please wait…'}
          </p>
          <p style={{ fontSize: '13px', color: '#94A3B8' }}>Supports .xlsx and .xls</p>

          <div style={{ marginTop: '24px', background: '#F8FAFC', borderRadius: '12px', padding: '16px', textAlign: 'left', display: 'inline-block', minWidth: '280px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0B1220', marginBottom: '8px' }}>Expected columns in your Excel:</p>
            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>• <strong>Name</strong> — student's full name</p>
            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>• <strong>Contact / Phone</strong> — parent's mobile number</p>
            <p style={{ fontSize: '12px', color: '#64748B' }}>• <strong>Boarding point / Location</strong> — optional</p>
          </div>
        </div>
      )}

      {/* STEP 2: Assign routes */}
      {step === 'assign' && (
        <div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <p style={{ fontWeight: 600, color: '#0B1220', fontSize: '15px' }}>📄 {fileName}</p>
                <p style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                  {sheetNames.length === 1
                    ? `${allRows[sheetNames[0]]?.length ?? 0} students found`
                    : `${sheetNames.length} sheets — assign each to a route`}
                </p>
              </div>
              <button onClick={reset} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#64748B' }}>
                Change file
              </button>
            </div>

            {sheetNames.map((sheetName) => (
              <div key={sheetName} style={{ border: '1px solid #F1F5F9', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, color: '#0B1220', marginBottom: '4px' }}>{sheetName}</p>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>{allRows[sheetName]?.length ?? 0} students</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(allRows[sheetName] ?? []).slice(0, 5).map((r, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#F1F5F9', color: '#64748B', padding: '3px 10px', borderRadius: '999px' }}>
                          {r.name || '(no name)'}
                        </span>
                      ))}
                      {(allRows[sheetName]?.length ?? 0) > 5 && (
                        <span style={{ fontSize: '11px', color: '#94A3B8', padding: '3px 4px' }}>
                          +{(allRows[sheetName]?.length ?? 0) - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ width: '220px', flexShrink: 0 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                      Which route?
                    </label>
                    <select
                      value={mapping[sheetName] ?? ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [sheetName]: e.target.value }))}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '10px', fontSize: '13px',
                        border: mapping[sheetName] ? '1px solid #16A34A' : '1px solid #CBD5E1',
                        background: mapping[sheetName] ? '#F0FDF4' : 'white',
                        color: '#0B1220', outline: 'none', cursor: 'pointer',
                      }}
                    >
                      <option value="">— Select a route —</option>
                      {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    {mapping[sheetName] && (
                      <p style={{ fontSize: '11px', color: '#16A34A', marginTop: '4px', fontWeight: 600 }}>✓ Route assigned</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '14px', color: totalStudents > 0 ? '#0B1220' : '#94A3B8' }}>
              {totalStudents > 0
                ? <>Ready to import <strong style={{ color: '#2563EB' }}>{totalStudents} students</strong></>
                : 'Assign sheets to routes to continue'}
            </p>
            <button
              onClick={handleImport}
              disabled={totalStudents === 0 || busy}
              style={{
                padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: totalStudents > 0 && !busy ? 'pointer' : 'not-allowed',
                background: totalStudents > 0 && !busy ? '#0B1220' : '#CBD5E1',
                color: 'white', fontSize: '14px', fontWeight: 600,
              }}
            >
              {busy ? 'Importing…' : `Import ${totalStudents} students`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 'done' && (
        <div>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0B1220', marginBottom: '16px' }}>Import complete</h2>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderBottom: i < results.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <span style={{ fontSize: '18px' }}>{r.startsWith('✓') ? '✅' : '❌'}</span>
                <p style={{ fontSize: '13px', color: '#0B1220' }}>{r.slice(2)}</p>
              </div>
            ))}
          </div>

          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#16A34A', marginBottom: '4px' }}>Parents can now log in</p>
            <p style={{ fontSize: '13px', color: '#166534' }}>
              Each parent just opens the TransTrack mobile app and types their mobile number — no password needed.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={reset} style={{ padding: '10px 20px', background: '#0B1220', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
              Import another file
            </button>
            <a href="/students" style={{ padding: '10px 20px', background: 'white', color: '#0B1220', border: '1px solid #E2E8F0', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
              View Students →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
