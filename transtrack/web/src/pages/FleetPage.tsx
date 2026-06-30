import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Vehicle } from '@/types';

interface Driver {
  id: string;
  full_name: string;
}

export function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState(40);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [v, d] = await Promise.all([
      api.get<{ vehicles: Vehicle[] }>('/fleet/vehicles'),
      api.get<{ drivers: Driver[] }>('/fleet/drivers'),
    ]);
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
      await api.post('/fleet/vehicles', { label, plateNumber: plate, capacity });
      setLabel('');
      setPlate('');
      setCapacity(40);
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vehicle');
    }
  }

  async function handleAssignDriver(vehicleId: string, driverId: string) {
    await api.patch(`/fleet/vehicles/${vehicleId}/driver`, { driverId: driverId || null });
    refresh();
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Fleet</h1>
          <p className="text-sm text-muted mt-0.5">{vehicles.length} vehicles registered</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Vehicle'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted mb-1.5">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bus 3" required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted mb-1.5">Plate Number</label>
            <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="TS-09-AB-9999" required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-route" />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-muted mb-1.5">Capacity</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
          </div>
          <button type="submit" className="px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors">
            Save
          </button>
        </form>
      )}
      {error && <p className="text-sm text-alert mb-4">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-muted uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Vehicle</th>
              <th className="px-5 py-3 font-medium">Plate</th>
              <th className="px-5 py-3 font-medium">Capacity</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Driver</th>
              <th className="px-5 py-3 font-medium">GPS Device</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3.5 font-medium text-ink">{v.label}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-muted">{v.plate_number}</td>
                <td className="px-5 py-3.5 text-muted">{v.capacity} seats</td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-5 py-3.5">
                  <select
                    value={v.current_driver_id ?? ''}
                    onChange={(e) => handleAssignDriver(v.id, e.target.value)}
                    className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-route"
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-muted">
                  {v.device_external_id ?? <span className="text-delay">Not paired</span>}
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted text-sm">No vehicles yet. Add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Vehicle['status'] }) {
  const styles = {
    ACTIVE: 'bg-active/10 text-active',
    MAINTENANCE: 'bg-delay/10 text-delay',
    INACTIVE: 'bg-slate-100 text-muted',
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>{status}</span>;
}
