import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import { api } from '@/lib/api';
import { useLiveTracking } from '@/hooks/useLiveTracking';
import { VehicleMarker } from '@/components/VehicleMarker';
import { Vehicle, RouteDetail, Trip } from '@/types';

const DEFAULT_CENTER: [number, number] = [17.4280, 78.4800];

export function LiveMapPage() {
  const [vehicleList, setVehicleList] = useState<Vehicle[]>([]);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [routesById, setRoutesById] = useState<Record<string, RouteDetail>>({});
  const { vehicles: liveVehicles, tripEvents, connected, watchVehicle } = useLiveTracking();

  useEffect(() => {
    api.get<{ vehicles: Vehicle[] }>('/fleet/vehicles').then((d) => setVehicleList(d.vehicles));
    api.get<{ trips: Trip[] }>('/trips').then((d) => {
      const inProgress = d.trips.filter((t) => t.status === 'IN_PROGRESS');
      setActiveTrips(inProgress);
    });
  }, []);

  useEffect(() => {
    for (const v of vehicleList) watchVehicle(v.id);
  }, [vehicleList, watchVehicle]);

  // Load route detail (for drawing the path line) for each active trip's route.
  useEffect(() => {
    activeTrips.forEach((trip) => {
      if (routesById[trip.route_id]) return;
      api.get<{ route: RouteDetail }>(`/routes/${trip.route_id}`).then((d) => {
        setRoutesById((prev) => ({ ...prev, [trip.route_id]: d.route }));
      });
    });
  }, [activeTrips, routesById]);

  const liveCount = Object.keys(liveVehicles).length;

  const routePolylines = useMemo(() => {
    return activeTrips
      .map((trip) => routesById[trip.route_id])
      .filter((r): r is RouteDetail => Boolean(r))
      .map((route) => ({
        id: route.id,
        positions: [...route.stops]
          .sort((a, b) => a.sequence - b.sequence)
          .map((s) => [s.lat, s.lng] as [number, number]),
      }));
  }, [activeTrips, routesById]);

  return (
    <div className="h-full flex">
      <div className="flex-1 relative">
        <MapContainer center={DEFAULT_CENTER} zoom={13} className="h-full w-full" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />
          {routePolylines.map((r) => (
            <Polyline key={r.id} positions={r.positions} pathOptions={{ color: '#2563EB', weight: 3, opacity: 0.4, dashArray: '6 6' }} />
          ))}
          {vehicleList.map((v) => {
            const live = liveVehicles[v.id];
            return live ? <VehicleMarker key={v.id} vehicle={v} live={live} /> : null;
          })}
        </MapContainer>

        <div className="absolute top-4 left-4 bg-white rounded-xl shadow-md px-4 py-2.5 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-active' : 'bg-alert'}`} />
          <span className="text-sm font-medium text-ink">
            {connected ? `${liveCount} vehicle${liveCount === 1 ? '' : 's'} live` : 'Reconnecting…'}
          </span>
        </div>
      </div>

      <aside className="w-80 border-l border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-ink">Active Trips</h2>
          <p className="text-xs text-muted mt-0.5">{activeTrips.length} in progress</p>
        </div>
        <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
          {activeTrips.length === 0 && (
            <p className="text-sm text-muted px-2 py-6 text-center">No trips in progress right now.</p>
          )}
          {activeTrips.map((trip) => (
            <div key={trip.id} className="px-3 py-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{trip.vehicle_label}</p>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-active/10 text-active">LIVE</span>
              </div>
              <p className="text-xs text-muted mt-0.5">{trip.route_name}</p>
              <p className="text-xs text-muted mt-0.5">Driver: {trip.driver_name}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-100">
          <h3 className="font-semibold text-ink text-sm mb-2">Recent Events</h3>
          <div className="space-y-2 max-h-48 overflow-auto">
            {tripEvents.length === 0 && <p className="text-xs text-muted">No events yet.</p>}
            {tripEvents.slice(0, 8).map((e) => (
              <div key={e.id} className="text-xs">
                <span className="font-medium text-ink">{formatEventType(e.event_type)}</span>
                <span className="text-muted"> · {new Date(e.occurred_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function formatEventType(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
