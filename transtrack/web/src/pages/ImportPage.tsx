import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { RouteSummary } from '@/types';

declare global {
  interface Window { XLSX: any; }
}

interface ParsedRow {
  name: string;
  phone: string;
  location?: string;
  boardingPoint?: string;
}

function findCol(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) =>
    keywords.some((kw) => h?.toLowerCase().includes(kw.toLowerCase()))
  );
}

function parseWorksheet(worksheet: any, XLSX: any): ParsedRow[] {
  const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (json.length < 2) return [];

  // Find header row — the row containing "name"
  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, json.length); i++) {
    if (json[i].some((c: any) => /name/i.test(String(c)))) {
      headerIdx = i;
      break;
    }
  }

  const headers = json[headerIdx].map((c: any) => String(c ?? ''));
  const nameCol   = findCol(headers, ['name', 'student']);
  const phoneCol  = findCol(headers, ['contact', 'phone', 'mobile', 'number']);
  const locCol    = findCol(headers, ['location', 'area', 'place']);
  const boardCol  = findCol(headers, ['boarding', 'stop', 'point']);

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < json.length; i++) {
    const row = json[i];
    const name  = String(nameCol  >= 0 ? row[nameCol]  ?? '' : '').trim();
    const phone = String(phoneCol >= 0 ? row[phoneCol] ?? '' : '').trim();
    if (!name && !phone) continue;
    rows.push({
      name,
      phone,
      location:     locCol   >= 0 ? String(row[locCol]   ?? '').trim() : undefined,
      boardingPoint: boardCol >= 0 ? String(row[boardCol] ?? '').trim() : undefined,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────
type Step = 'upload' | 'map' | 'preview' | 'done';

export function ImportPage() {
  const [step, setStep]       = useState<Step>('upload');
  const [routes, setRoutes]   = useState<RouteSummary[]>([]);
  const [xlsxReady, setXlsxReady] = useState(false);

  // Per-file state
  const [fileName, setFileName]   = useState('');
  const [sheets, setSheets]       = useState<{ name: string; rows: ParsedRow[] }[]>([]);
  const [mapping, setMapping]     = useState<Record<string, string>>({}); // sheetName → routeId
  const [result, setResult]       = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ routes: RouteSummary[] }>('/routes').then((d) => setRoutes(d.routes));
    if (window.XLSX) { setXlsxReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => setXlsxReady(true);
    document.head.appendChild(s);
  }, []);

  // ── Step 1: Upload ─────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !window.XLSX) return;
    setFileName(file.name);
    setError(null);
    setResult([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = window.XLSX.read(evt.target?.result, { type: 'binary' });
        const parsed = wb.SheetNames.map((name: string) => ({
          name,
          rows: parseWorksheet(wb.Sheets[name], window.XLSX),
        })).filter((s: any) => s.rows.length > 0);

        if (parsed.length === 0) {
          setError('No student data found in this file. Make sure it has columns for Name and Contact/Phone.');
          return;
        }
        setSheets(parsed);
        // Auto-map if only one sheet
        if (parsed.length === 1) {
          setMapping({ [parsed[0].name]: '' });
        } else {
          const m: Record<string, string> = {};
          parsed.forEach((s: any) => { m[s.name] = ''; });
          setMapping(m);
        }
        setStep('map');
      } catch {
        setError('Could not read this file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  // ── Step 2: Map sheets → routes ────────────────────────────────
  const allMapped = sheets.every((s) => mapping[s.name]);

  // ── Step 3: Import ─────────────────────────────────────────────
  async function handleImport() {
    setImporting(true);
    setError(null);
    const newResults: string[] = [];

    for (const sheet of sheets) {
      const routeId = mapping[sheet.name];
      if (!routeId) continue;
      const routeName = routes.find((r) => r.id === routeId)?.name ?? routeId;
      try {
        const data = await api.post<{ message: string }>('/import/students', {
          routeId,
          rows: sheet.rows,
        });
        newResults.push(`✓ "${sheet.name}" → ${routeName}: ${data.message}`);
      } catch (err) {
        newResults.push(`✗ "${sheet.name}": ${err instanceof Error ? err.message : 'Import failed'}`);
      }
    }

    setResult(newResults);
    setImporting(false);
    setStep('done');
  }

  function reset() {
    setStep('upload');
    setSheets([]);
    setMapping({});
    setResult([]);
    setFileName('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const totalStudents = sheets
    .filter((s) => mapping[s.name])
    .reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-ink">Import Students from Excel</h1>
        <p className="text-sm text-muted mt-1">
          Upload your Excel file, assign it to a route, and all students and parent accounts are created automatically.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = { upload: '1. Upload', map: '2. Assign Route', preview: '3. Preview', done: '4. Done' };
          const active = step === s;
          const past = ['upload','map','preview','done'].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? 'bg-ink text-white' : past ? 'bg-active/10 text-active' : 'bg-slate-100 text-muted'
              }`}>
                {past ? '✓ ' : ''}{labels[s]}
              </div>
              {i < 3 && <div className="w-6 h-px bg-slate-200" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6 flex justify-between">
          <p className="text-sm text-alert">{error}</p>
          <button onClick={() => setError(null)} className="text-muted text-xs ml-4 hover:text-ink">✕</button>
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 'upload' && (
        <div
          onClick={() => xlsxReady && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 text-center transition-colors ${
            xlsxReady
              ? 'border-slate-200 hover:border-route hover:bg-route/5 cursor-pointer'
              : 'border-slate-100 opacity-60'
          }`}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          <div className="text-4xl mb-4">📊</div>
          <p className="font-semibold text-ink text-lg mb-1">
            {xlsxReady ? 'Click to upload your Excel file' : 'Loading Excel reader…'}
          </p>
          <p className="text-sm text-muted">Supports .xlsx and .xls — one or multiple sheets</p>
          <div className="mt-6 text-xs text-muted bg-slate-50 rounded-xl p-4 text-left max-w-sm mx-auto">
            <p className="font-medium text-ink mb-2">Expected columns in your Excel:</p>
            <p>• <strong>Name</strong> — student's full name</p>
            <p>• <strong>Contact / Phone</strong> — parent's mobile number</p>
            <p>• <strong>Location / Boarding point</strong> — optional</p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Assign routes ── */}
      {step === 'map' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-ink">📄 {fileName}</p>
              <button onClick={reset} className="text-xs text-muted hover:text-ink underline">
                Change file
              </button>
            </div>
            <p className="text-sm text-muted mb-6">
              {sheets.length === 1
                ? `${sheets[0].rows.length} students found`
                : `${sheets.length} sheets found — assign each to a route`}
            </p>

            <div className="space-y-4">
              {sheets.map((sheet) => (
                <div key={sheet.name} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-ink">{sheet.name}</p>
                      <p className="text-xs text-muted mt-0.5 mb-3">{sheet.rows.length} students</p>
                      {/* Name preview chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {sheet.rows.slice(0, 5).map((r, i) => (
                          <span key={i} className="text-xs bg-slate-100 text-muted px-2.5 py-1 rounded-full">
                            {r.name || '(no name)'}
                          </span>
                        ))}
                        {sheet.rows.length > 5 && (
                          <span className="text-xs text-muted px-1 py-1">
                            +{sheet.rows.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Route selector */}
                    <div className="w-56 flex-shrink-0">
                      <label className="block text-xs font-medium text-muted mb-1.5">
                        Which route?
                      </label>
                      <select
                        value={mapping[sheet.name] ?? ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [sheet.name]: e.target.value }))}
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-route transition-colors ${
                          mapping[sheet.name]
                            ? 'border-active bg-active/5 text-ink'
                            : 'border-slate-200 text-muted'
                        }`}
                      >
                        <option value="">— Select a route —</option>
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      {mapping[sheet.name] && (
                        <p className="text-xs text-active mt-1 font-medium">✓ Route assigned</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary + action */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-6 py-4">
            <div>
              {allMapped ? (
                <p className="text-sm font-medium text-ink">
                  Ready to import <span className="text-route">{totalStudents} students</span>
                </p>
              ) : (
                <p className="text-sm text-muted">Assign all sheets to a route to continue</p>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={!allMapped || importing}
              className="px-6 py-2.5 bg-ink text-white text-sm font-medium rounded-xl hover:bg-ink/90 transition-colors disabled:opacity-40"
            >
              {importing ? 'Importing…' : `Import ${totalStudents} students`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-ink mb-4">Import complete</h2>
            {result.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 ${r.startsWith('✓') ? '' : 'opacity-80'}`}>
                <span className={`text-lg ${r.startsWith('✓') ? 'text-active' : 'text-alert'}`}>
                  {r.startsWith('✓') ? '✓' : '✗'}
                </span>
                <p className="text-sm text-ink">{r.slice(2)}</p>
              </div>
            ))}
          </div>

          <div className="bg-active/5 border border-active/20 rounded-2xl p-5">
            <p className="text-sm font-medium text-active mb-1">Parents can now log in</p>
            <p className="text-sm text-slate-600">
              Each parent's mobile number is their login on the TransTrack mobile app —
              no password, no email, just their number.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-ink text-white text-sm font-medium rounded-xl hover:bg-ink/90 transition-colors"
            >
              Import another file
            </button>
            <a
              href="/students"
              className="px-5 py-2.5 border border-slate-200 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors text-ink"
            >
              View Students →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
