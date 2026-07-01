import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { RouteSummary } from '@/types';
import { useEffect } from 'react';

/**
 * Excel Import page — reads your Excel file entirely in the browser
 * (no file upload server needed) using SheetJS, lets you map each sheet
 * to a route, previews the rows, and sends them to POST /import/students.
 *
 * Expected Excel column names (case-insensitive, partial match):
 *   Name / Student Name     → student's full name
 *   Contact / Phone / Mobile → parent's phone number
 *   Location / Area          → area (optional, stored as note)
 *   Boarding / Stop           → boarding point (optional)
 *   Apartment / Apt           → apartment name (optional)
 */

declare global {
  interface Window {
    XLSX: any;
  }
}

interface ParsedRow {
  name: string;
  phone: string;
  location?: string;
  boardingPoint?: string;
  apartment?: string;
}

interface SheetData {
  sheetName: string;
  rows: ParsedRow[];
  routeId: string;
}

function findCol(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) =>
    keywords.some((kw) => h?.toLowerCase().includes(kw.toLowerCase()))
  );
}

function parseSheet(worksheet: any, XLSX: any): ParsedRow[] {
  const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (json.length < 2) return [];

  // Find the header row — look for the row that has "Name" somewhere
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, json.length); i++) {
    const row = json[i].map((c: any) => String(c));
    if (row.some((c: string) => /name/i.test(c))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = json[headerRowIdx].map((c: any) => String(c ?? ''));
  const nameCol = findCol(headers, ['name', 'student']);
  const phoneCol = findCol(headers, ['contact', 'phone', 'mobile', 'number']);
  const locationCol = findCol(headers, ['location', 'area', 'place']);
  const boardingCol = findCol(headers, ['boarding', 'stop', 'point']);
  const aptCol = findCol(headers, ['apartment', 'apt', 'flat', 'residence']);

  const rows: ParsedRow[] = [];
  for (let i = headerRowIdx + 1; i < json.length; i++) {
    const row = json[i];
    const name = String(row[nameCol] ?? '').trim();
    const phone = String(row[phoneCol] ?? '').trim();
    if (!name && !phone) continue; // skip truly blank rows
    rows.push({
      name,
      phone,
      location: locationCol >= 0 ? String(row[locationCol] ?? '').trim() : undefined,
      boardingPoint: boardingCol >= 0 ? String(row[boardingCol] ?? '').trim() : undefined,
      apartment: aptCol >= 0 ? String(row[aptCol] ?? '').trim() : undefined,
    });
  }
  return rows;
}

export function ImportPage() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [xlsxLoaded, setXlsxLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load SheetJS from CDN dynamically — no npm install needed
  useEffect(() => {
    api.get<{ routes: RouteSummary[] }>('/routes').then((d) => setRoutes(d.routes));

    if (window.XLSX) { setXlsxLoaded(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => setXlsxLoaded(true);
    document.head.appendChild(script);
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !window.XLSX) return;
    setFileName(file.name);
    setResults([]);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = window.XLSX.read(data, { type: 'binary' });
        const parsed: SheetData[] = workbook.SheetNames.map((name: string) => ({
          sheetName: name,
          rows: parseSheet(workbook.Sheets[name], window.XLSX),
          routeId: '',
        }));
        setSheets(parsed);
      } catch (err) {
        setError('Could not read the Excel file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  function setSheetRoute(idx: number, routeId: string) {
    setSheets((prev) => prev.map((s, i) => i === idx ? { ...s, routeId } : s));
  }

  async function handleImport() {
    setError(null);
    const sheetsToImport = sheets.filter((s) => s.routeId && s.rows.length > 0);
    if (sheetsToImport.length === 0) {
      setError('Please assign at least one sheet to a route before importing.');
      return;
    }

    setImporting(true);
    const newResults: string[] = [];

    for (const sheet of sheetsToImport) {
      try {
        const data = await api.post<{ message: string; results: any }>('/import/students', {
          routeId: sheet.routeId,
          rows: sheet.rows,
        });
        newResults.push(`✓ ${sheet.sheetName}: ${data.message}`);
      } catch (err) {
        newResults.push(`✗ ${sheet.sheetName}: ${err instanceof Error ? err.message : 'Import failed'}`);
      }
    }

    setResults(newResults);
    setImporting(false);
  }

  const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
  const assignedSheets = sheets.filter((s) => s.routeId).length;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Import Students from Excel</h1>
        <p className="text-sm text-muted mt-1">
          Upload your Excel file. Each sheet becomes one route's worth of students.
          Parent accounts are created automatically using the contact number.
        </p>
      </div>

      {!xlsxLoaded && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6 text-sm text-muted">
          Loading Excel reader…
        </div>
      )}

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-route hover:bg-route/5 transition-colors mb-6"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <p className="text-2xl mb-2">📊</p>
        {fileName ? (
          <>
            <p className="font-medium text-ink">{fileName}</p>
            <p className="text-sm text-muted mt-1">{totalRows} rows found across {sheets.length} sheet(s)</p>
            <p className="text-xs text-route mt-2">Click to change file</p>
          </>
        ) : (
          <>
            <p className="font-medium text-ink">Click to upload your Excel file</p>
            <p className="text-sm text-muted mt-1">Supports .xlsx and .xls files</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-alert">{error}</p>
        </div>
      )}

      {/* Sheet → Route mapping */}
      {sheets.length > 0 && (
        <div className="space-y-4 mb-6">
          <h2 className="font-semibold text-ink">Assign each sheet to a route</h2>
          <p className="text-xs text-muted -mt-2">
            Each sheet in your Excel file is one route. Select which route each sheet's students belong to.
          </p>
          {sheets.map((sheet, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="font-medium text-ink">{sheet.sheetName}</p>
                  <p className="text-xs text-muted mt-0.5">{sheet.rows.length} students</p>
                  {/* Preview first 3 names */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sheet.rows.slice(0, 4).map((r, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-muted px-2 py-0.5 rounded-full">
                        {r.name || '(no name)'}
                      </span>
                    ))}
                    {sheet.rows.length > 4 && (
                      <span className="text-xs text-muted px-1 py-0.5">+{sheet.rows.length - 4} more</span>
                    )}
                  </div>
                </div>
                <div className="w-64 flex-shrink-0">
                  <label className="block text-xs font-medium text-muted mb-1.5">Assign to route</label>
                  <select
                    value={sheet.routeId}
                    onChange={(e) => setSheetRoute(idx, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route"
                  >
                    <option value="">— Skip this sheet —</option>
                    {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import button */}
      {sheets.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleImport}
            disabled={importing || assignedSheets === 0}
            className="px-6 py-2.5 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${assignedSheets} sheet(s)`}
          </button>
          {assignedSheets === 0 && (
            <p className="text-xs text-muted">Assign at least one sheet to a route to continue.</p>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 space-y-2">
          <h3 className="font-semibold text-ink mb-3">Import results</h3>
          {results.map((r, i) => (
            <p key={i} className={`text-sm ${r.startsWith('✓') ? 'text-active' : 'text-alert'}`}>{r}</p>
          ))}
          <p className="text-xs text-muted pt-2 border-t border-slate-100 mt-3">
            Parents can now log in to the mobile app using their phone number.
            Go to Students to review the imported data.
          </p>
        </div>
      )}
    </div>
  );
}
