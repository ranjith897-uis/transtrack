import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { RouteSummary, RouteDetail } from '@/types';

interface StopDraft {
  name: string;
  lat: string;
  lng: string;
}

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selected, setSelected] = useState<RouteDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [stops, setStops] = useState<StopDraft[]>([{ name: '', lat: '', lng: '' }]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const d = await api.get<{ routes: RouteSummary[] }>('/routes');
    setRoutes(d.routes);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function openRoute(id: string) {
    const d = await api.get<{ route: RouteDetail }>(`/routes/${id}`);
    setSelected(d.route);
  }

  function updateStop(idx: number, field: keyof StopDraft, value: string) {
    setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/routes', {
        name,
        stops: stops
          .filter((s) => s.name && s.lat && s.lng)
          .map((s, i) => ({ name: s.name, sequence: i + 1, lat: parseFloat(s.lat), lng: parseFloat(s.lng) })),
      });
      setName('');
      setStops([{ name: '', lat: '', lng: '' }]);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create route');
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
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Route'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Route Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Route 2 - Afternoon Drop-off" required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Stops (in order)</label>
              <div className="space-y-2">
                {stops.map((stop, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="w-6 text-xs text-muted pt-2.5 font-mono">{idx + 1}.</span>
                    <input value={stop.name} onChange={(e) => updateStop(idx, 'name', e.target.value)} placeholder="Stop name"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
                    <input value={stop.lat} onChange={(e) => updateStop(idx, 'lat', e.target.value)} placeholder="Latitude"
                      className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-route" />
                    <input value={stop.lng} onChange={(e) => updateStop(idx, 'lng', e.target.value)} placeholder="Longitude"
                      className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-route" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStops((prev) => [...prev, { name: '', lat: '', lng: '' }])}
                className="mt-2 text-sm text-route font-medium hover:underline"
              >
                + Add stop
              </button>
            </div>

            {error && <p className="text-sm text-alert">{error}</p>}
            <button type="submit" className="px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors">
              Save Route
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => openRoute(r.id)}
              className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors ${selected?.id === r.id ? 'bg-route/5' : ''}`}
            >
              <p className="text-sm font-medium text-ink">{r.name}</p>
              {r.description && <p className="text-xs text-muted mt-0.5">{r.description}</p>}
            </button>
          ))}
          {routes.length === 0 && <p className="px-5 py-10 text-center text-muted text-sm">No routes yet. Create your first one above.</p>}
        </div>
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-8">
            <h3 className="font-semibold text-ink mb-1">{selected.name}</h3>
            <p className="text-xs text-muted mb-4">{selected.stops.length} stops</p>
            <ol className="space-y-3">
              {selected.stops.map((stop) => (
                <li key={stop.id} className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-route/10 text-route text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                    {stop.sequence}
                  </span>
                  <div>
                    <p className="text-ink font-medium">{stop.name}</p>
                    <p className="text-xs text-muted font-mono">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>
                    {stop.scheduled_time && <p className="text-xs text-muted">Scheduled: {stop.scheduled_time}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
