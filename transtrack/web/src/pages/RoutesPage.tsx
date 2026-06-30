import { useEffect, useState, useRef, FormEvent } from 'react';
import { api } from '@/lib/api';
import { RouteSummary, RouteDetail, Stop } from '@/types';

// ─────────────────────────────────────────────────────────────────
// Address search using OpenStreetMap Nominatim — free, no API key.
// ─────────────────────────────────────────────────────────────────

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function searchAddress(query: string): Promise<GeoResult[]> {
  if (query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// Address search input component with dropdown suggestions
// ─────────────────────────────────────────────────────────────────

interface AddressSearchProps {
  value: string;
  onChange: (name: string, lat: string, lng: string) => void;
  placeholder?: string;
}

function AddressSearch({ value, onChange, placeholder }: AddressSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  function handleInput(val: string) {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchAddress(val);
      setResults(r);
      setSearching(false);
    }, 400);
  }

  function pick(result: GeoResult) {
    const shortName = result.display_name.split(',').slice(0, 2).join(',').trim();
    setQuery(shortName);
    setResults([]);
    onChange(shortName, result.lat, result.lon);
  }

  return (
    <div className="relative flex-1">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder={placeholder ?? 'Search for a location...'}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route"
      />
      {searching && (
        <p className="absolute left-3 top-full mt-1 text-xs text-muted bg-white z-10">Searching...</p>
      )}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-auto">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              <p className="text-ink font-medium truncate">{r.display_name.split(',').slice(0, 2).join(',')}</p>
              <p className="text-xs text-muted truncate">{r.display_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Stop draft with resolved coordinates
// ─────────────────────────────────────────────────────────────────

interface StopDraft {
  name: string;
  lat: string;
  lng: string;
  resolved: boolean; // true once an address was picked from dropdown
}

// ─────────────────────────────────────────────────────────────────
// Main Routes page
// ─────────────────────────────────────────────────────────────────

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selected, setSelected] = useState<RouteDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [name, setName] = useState('');
  const [stops, setStops] = useState<StopDraft[]>([{ name: '', lat: '', lng: '', resolved: false }]);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  async function refresh() {
    const d = await api.get<{ routes: RouteSummary[] }>('/routes');
    setRoutes(d.routes);
  }

  useEffect(() => { refresh(); }, []);

  async function openRoute(id: string) {
    const d = await api.get<{ route: RouteDetail }>(`/routes/${id}`);
    setSelected(d.route);
    setEditingName(false);
  }

  function updateStop(idx: number, name: string, lat: string, lng: string) {
    setStops((prev) => prev.map((s, i) =>
      i === idx ? { name, lat, lng, resolved: lat !== '' } : s
    ));
  }

  function removeStop(idx: number) {
    setStops((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const validStops = stops.filter((s) => s.name && s.lat && s.lng);
    if (validStops.length === 0) {
      setError('Add at least one stop before saving.');
      return;
    }
    const unresolved = stops.filter((s) => s.name && !s.lat);
    if (unresolved.length > 0) {
      setError('Some stops don\'t have a location yet — pick a suggestion from the dropdown for each one.');
      return;
    }
    try {
      await api.post('/routes', {
        name,
        stops: validStops.map((s, i) => ({
          name: s.name,
          sequence: i + 1,
          lat: parseFloat(s.lat),
          lng: parseFloat(s.lng),
        })),
      });
      setName('');
      setStops([{ name: '', lat: '', lng: '', resolved: false }]);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create route');
    }
  }

  async function handleRename() {
    if (!selected || !editNameValue.trim()) return;
    try {
      await api.patch(`/routes/${selected.id}`, { name: editNameValue.trim() });
      await openRoute(selected.id);
      refresh();
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename route');
    }
  }

  async function handleDeleteRoute(id: string) {
    try {
      await api.delete(`/routes/${id}`);
      setSelected(null);
      setDeleteConfirmId(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route');
    }
  }

  async function handleDeleteStop(stop: Stop) {
    if (!selected) return;
    if (!window.confirm(`Remove stop "${stop.name}" from this route?`)) return;
    try {
      await api.delete(`/routes/${selected.id}/stops/${stop.id}`);
      await openRoute(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove stop');
    }
  }

  async function handleAddStop(name: string, lat: string, lng: string) {
    if (!selected || !name || !lat || !lng) return;
    const nextSeq = (selected.stops.length > 0 ? Math.max(...selected.stops.map((s) => s.sequence)) : 0) + 1;
    try {
      await api.post(`/routes/${selected.id}/stops`, {
        name,
        sequence: nextSeq,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      });
      await openRoute(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stop');
    }
  }

  return (
    <div className="p-8 max-w-5xl flex gap-8">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Routes</h1>
            <p className="text-sm text-muted mt-0.5">{routes.length} routes defined</p>
          </div>
          <button
            onClick={() => { setShowForm((s) => !s); setSelected(null); }}
            className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Route'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 mb-4 flex justify-between items-start">
            <p className="text-sm text-alert">{error}</p>
            <button onClick={() => setError(null)} className="text-muted text-xs ml-4 hover:text-ink">✕</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Route Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Route 1 - Chevella Morning"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-2">
                Stops — search by address or landmark name
              </label>
              <div className="space-y-2">
                {stops.map((stop, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="w-6 text-xs text-muted pt-2.5 font-mono flex-shrink-0">{idx + 1}.</span>
                    <AddressSearch
                      value={stop.name}
                      placeholder={idx === 0 ? 'e.g. Chevella Bus Stand' : 'Search for next stop...'}
                      onChange={(n, lat, lng) => updateStop(idx, n, lat, lng)}
                    />
                    {stop.resolved && (
                      <span className="text-active text-xs pt-2.5 flex-shrink-0">✓</span>
                    )}
                    {stops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(idx)}
                        className="text-muted hover:text-alert text-xs pt-2.5 flex-shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStops((prev) => [...prev, { name: '', lat: '', lng: '', resolved: false }])}
                className="mt-2 text-sm text-route font-medium hover:underline"
              >
                + Add another stop
              </button>
            </div>

            <button type="submit" className="px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors">
              Save Route
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {routes.map((r) => (
            <div key={r.id} className={`flex items-center group ${selected?.id === r.id ? 'bg-route/5' : ''}`}>
              <button
                onClick={() => openRoute(r.id)}
                className="flex-1 text-left px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm font-medium text-ink">{r.name}</p>
                {r.description && <p className="text-xs text-muted mt-0.5">{r.description}</p>}
              </button>
              {deleteConfirmId === r.id ? (
                <div className="flex items-center gap-2 pr-4">
                  <span className="text-xs text-muted">Delete?</span>
                  <button
                    onClick={() => handleDeleteRoute(r.id)}
                    className="text-xs font-medium text-alert hover:underline"
                  >Yes</button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="text-xs text-muted hover:underline"
                  >No</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(r.id)}
                  className="opacity-0 group-hover:opacity-100 mr-4 text-xs text-muted hover:text-alert transition-all"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
          {routes.length === 0 && (
            <p className="px-5 py-10 text-center text-muted text-sm">No routes yet. Create your first one above.</p>
          )}
        </div>
      </div>

      {/* Right panel: route detail with edit and stop management */}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-8 space-y-4">

            {/* Route name with inline edit */}
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="flex-1 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route"
                  autoFocus
                />
                <button onClick={handleRename} className="text-xs font-medium text-route hover:underline">Save</button>
                <button onClick={() => setEditingName(false)} className="text-xs text-muted hover:underline">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">{selected.name}</h3>
                <button
                  onClick={() => { setEditNameValue(selected.name); setEditingName(true); }}
                  className="text-xs text-muted hover:text-route"
                >
                  Rename
                </button>
              </div>
            )}

            <p className="text-xs text-muted">{selected.stops.length} stop{selected.stops.length !== 1 ? 's' : ''}</p>

            {/* Stops list with delete per stop */}
            <ol className="space-y-3">
              {[...selected.stops]
                .sort((a, b) => a.sequence - b.sequence)
                .map((stop) => (
                  <li key={stop.id} className="flex gap-3 text-sm group/stop">
                    <span className="w-5 h-5 rounded-full bg-route/10 text-route text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                      {stop.sequence}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink font-medium truncate">{stop.name}</p>
                      <p className="text-xs text-muted font-mono">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteStop(stop)}
                      className="opacity-0 group-hover/stop:opacity-100 text-xs text-muted hover:text-alert flex-shrink-0 mt-0.5 transition-all"
                    >
                      ✕
                    </button>
                  </li>
                ))}
            </ol>

            {/* Add a stop to existing route */}
            <AddStopToRoute onAdd={handleAddStop} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Add stop to an existing route
// ─────────────────────────────────────────────────────────────────

function AddStopToRoute({ onAdd }: { onAdd: (name: string, lat: string, lng: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  function handleAdd() {
    if (!name || !lat || !lng) return;
    onAdd(name, lat, lng);
    setName('');
    setLat('');
    setLng('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-sm text-route font-medium hover:underline text-left"
      >
        + Add stop to this route
      </button>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium text-muted">New stop</p>
      <AddressSearch
        value={name}
        placeholder="Search for a location..."
        onChange={(n, la, lo) => { setName(n); setLat(la); setLng(lo); }}
      />
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!name || !lat}
          className="px-3 py-1.5 bg-route text-white text-xs font-medium rounded-lg hover:bg-route/90 disabled:opacity-40 transition-colors"
        >
          Add stop
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
