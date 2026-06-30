import { Marker, Popup } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { VehicleLiveState, Vehicle } from '@/types';

interface VehicleMarkerProps {
  vehicle: Vehicle;
  live: VehicleLiveState;
}

const STALE_THRESHOLD_MS = 30_000;

/**
 * The marker is the product's core trust signal made visible: a pulsing
 * ring while pings are fresh, frozen grey when a vehicle goes stale.
 * Built as a Leaflet divIcon (not a default pin) so the pulse animation
 * and heading rotation render in plain CSS.
 */
export function VehicleMarker({ vehicle, live }: VehicleMarkerProps) {
  const isStale = Date.now() - new Date(live.lastUpdatedAt).getTime() > STALE_THRESHOLD_MS;
  const color = isStale ? '#94A3B8' : '#2563EB';

  const icon = divIcon({
    className: '',
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        ${
          !isStale
            ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.35;animation:pulseRing 2s cubic-bezier(0.4,0,0.6,1) infinite;"></span>`
            : ''
        }
        <div style="
          width:22px;height:22px;border-radius:9999px;background:${color};
          border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          transform: rotate(${live.heading ?? 0}deg);
        ">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2l8 16-8-4-8 4z"/></svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <Marker position={[live.lat, live.lng]} icon={icon}>
      <Popup>
        <div className="font-sans min-w-[160px]">
          <p className="font-semibold text-ink">{vehicle.label}</p>
          <p className="text-xs text-muted font-mono mt-0.5">{vehicle.plate_number}</p>
          <div className="mt-2 text-xs space-y-1">
            <p>
              <span className="text-muted">Speed:</span>{' '}
              <span className="font-mono">{live.speedKmh != null ? `${live.speedKmh.toFixed(0)} km/h` : '—'}</span>
            </p>
            <p>
              <span className="text-muted">Driver:</span> {vehicle.driver_name ?? 'Unassigned'}
            </p>
            <p className={isStale ? 'text-delay' : 'text-active'}>
              {isStale ? '⚠ Signal stale' : '● Live'}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
