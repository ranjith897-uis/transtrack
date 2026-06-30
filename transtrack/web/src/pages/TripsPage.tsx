import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Trip, RouteSummary, Vehicle } from '@/types';

interface Driver {
  id: string;
  full_name: string;
}

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripType, setTripType] = useState<'PICKUP' | 'DROPOFF' | 'FIELD_TRIP' | 'OTHER'>('PICKUP');
  const [scheduledStart, setScheduledStart] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [t, r, v, d] = await Promise.all([
      api.get<{ trips: Trip[] }>('/trips'),
      api.get<{ routes: RouteSummary[] }>('/routes'),
      api.get<{ vehicles: Vehicle[] }>('/fleet/vehicles'),
      api.get<{ drivers: Driver[] }>('/fleet/drivers'),
    ]);
    setTrips(t.trips);
    setRoutes(r.routes);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/trips', {
        routeId,
        vehicleId,
        driverId,
        tripType,
        scheduledStart: new Date(scheduledStart).toISOString(),
      });
      setShowForm(false);
      setRouteId('');
      setVehicleId('');
      setDriverId('');
      setScheduledStart('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule trip');
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Trips</h1>
          <p className="text-sm text-muted mt-0.5">{trips.length} trips total</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Schedule Trip'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Route</label>
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
              <option value="">Select a route</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Vehicle</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
              <option value="">Select a vehicle</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Driver</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
              <option value="">Select a driver</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Trip Type</label>
            <select value={tripType} onChange={(e) => setTripType(e.target.value as typeof tripType)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
              <option value="PICKUP">Pickup</option>
              <option value="DROPOFF">Drop-off</option>
              <option value="FIELD_TRIP">Field Trip</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5">Scheduled Start</label>
            <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
          </div>
          {error && <p className="text-sm text-alert col-span-2">{error}</p>}
          <button type="submit" className="col-span-2 px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors">
            Schedule Trip
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-muted uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Route</th>
              <th className="px-5 py-3 font-medium">Vehicle</th>
              <th className="px-5 py-3 font-medium">Driver</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Scheduled</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3.5 font-medium text-ink">{t.route_name}</td>
                <td className="px-5 py-3.5 text-muted">{t.vehicle_label}</td>
                <td className="px-5 py-3.5 text-muted">{t.driver_name}</td>
                <td className="px-5 py-3.5 text-muted">{t.trip_type}</td>
                <td className="px-5 py-3.5 text-muted">{new Date(t.scheduled_start).toLocaleString()}</td>
                <td className="px-5 py-3.5"><TripStatusBadge status={t.status} /></td>
              </tr>
            ))}
            {trips.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted text-sm">No trips scheduled yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TripStatusBadge({ status }: { status: Trip['status'] }) {
  const styles: Record<Trip['status'], string> = {
    SCHEDULED: 'bg-slate-100 text-muted',
    IN_PROGRESS: 'bg-active/10 text-active',
    COMPLETED: 'bg-route/10 text-route',
    CANCELLED: 'bg-alert/10 text-alert',
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>{status.replace('_', ' ')}</span>;
}
