import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Vehicle } from '@/types';

interface Driver { id: string; full_name: string; email: string; phone: string | null; }

type Tab = 'vehicles' | 'drivers';

export function FleetPage() {
  const [tab, setTab]             = useState<Tab>('vehicles');
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [drivers, setDrivers]     = useState<Driver[]>([]);
  const [error, setError]         = useState<string | null>(null);

  // Vehicle form
  const [showVForm, setShowVForm] = useState(false);
  const [vLabel, setVLabel]       = useState('');
  const [vPlate, setVPlate]       = useState('');
  const [vCap, setVCap]           = useState(40);

  // Driver form
  const [showDForm, setShowDForm] = useState(false);
  const [dName, setDName]         = useState('');
  const [dEmail, setDEmail]       = useState('');
  const [dPhone, setDPhone]       = useState('');
  const [dPass, setDPass]         = useState('');
  const [saving, setSaving]       = useState(false);

  async function refresh() {
    const [v, d] = await Promise.all([
      api.get<{ vehicles: Vehicle[] }>('/fleet/vehicles'),
      api.get<{ drivers: Driver[] }>('/fleet/drivers'),
    ]);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
  }

  useEffect(() => { refresh(); }, []);

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await api.post('/fleet/vehicles', { label: vLabel, plateNumber: vPlate, capacity: vCap });
      setVLabel(''); setVPlate(''); setVCap(40); setShowVForm(false);
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleAddDriver(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await api.post('/fleet/drivers', { fullName: dName, email: dEmail, phone: dPhone, password: dPass });
      setDName(''); setDEmail(''); setDPhone(''); setDPass('');
      setShowDForm(false); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleAssignDriver(vehicleId: string, driverId: string) {
    await api.patch(`/fleet/vehicles/${vehicleId}/driver`, { driverId: driverId || null });
    refresh();
  }

  const tabStyle = (t: Tab) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: tab === t ? '#0B1220' : 'transparent', color: tab === t ? 'white' : '#64748B',
    transition: 'all 0.15s',
  } as React.CSSProperties);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0',
    fontSize: 14, color: '#0B1220', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 32, maxWidth: 960, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 20 }}>Fleet Management</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        <button style={tabStyle('vehicles')} onClick={() => setTab('vehicles')}>🚌 Vehicles ({vehicles.length})</button>
        <button style={tabStyle('drivers')}  onClick={() => setTab('drivers')}>👤 Drivers ({drivers.length})</button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#DC2626', fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
          {error} <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
        </div>
      )}

      {/* ── VEHICLES TAB ── */}
      {tab === 'vehicles' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowVForm(s => !s)} style={{ padding: '10px 20px', background: '#0B1220', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {showVForm ? 'Cancel' : '+ Add Vehicle'}
            </button>
          </div>

          {showVForm && (
            <form onSubmit={handleAddVehicle} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Label</label>
                <input value={vLabel} onChange={e => setVLabel(e.target.value)} placeholder="Bus 4" required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Plate Number</label>
                <input value={vPlate} onChange={e => setVPlate(e.target.value)} placeholder="TS-09-EZ-1234" required style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Seats</label>
                <input type="number" value={vCap} onChange={e => setVCap(parseInt(e.target.value))} style={inputStyle} />
              </div>
              <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, height: 42 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          )}

          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Vehicle', 'Plate', 'Seats', 'Status', 'Driver', 'GPS Device'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, i) => (
                  <tr key={v.id} style={{ borderBottom: i < vehicles.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0B1220' }}>{v.label}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{v.plate_number}</td>
                    <td style={{ padding: '12px 16px', color: '#64748B' }}>{v.capacity}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#DCFCE7', color: '#16A34A', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{v.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <select value={v.current_driver_id ?? ''} onChange={e => handleAssignDriver(v.id, e.target.value)}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#0B1220', cursor: 'pointer', outline: 'none' }}>
                        <option value="">Unassigned</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: v.device_external_id ? '#64748B' : '#D97706' }}>
                      {v.device_external_id ?? 'Not paired'}
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>No vehicles yet. Add one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── DRIVERS TAB ── */}
      {tab === 'drivers' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowDForm(s => !s)} style={{ padding: '10px 20px', background: '#0B1220', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {showDForm ? 'Cancel' : '+ Add Driver'}
            </button>
          </div>

          {showDForm && (
            <form onSubmit={handleAddDriver} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Full Name *</label>
                  <input value={dName} onChange={e => setDName(e.target.value)} placeholder="e.g. Ramesh Kumar" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Mobile Number</label>
                  <input value={dPhone} onChange={e => setDPhone(e.target.value)} placeholder="9876543210" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Login Email * <span style={{ fontWeight: 400 }}>(driver uses this to log in)</span></label>
                  <input type="email" value={dEmail} onChange={e => setDEmail(e.target.value)} placeholder="driver@example.com" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Password * <span style={{ fontWeight: 400 }}>(min 8 characters)</span></label>
                  <input type="password" value={dPass} onChange={e => setDPass(e.target.value)} placeholder="Min 8 characters" required minLength={8} style={inputStyle} />
                </div>
              </div>
              <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {saving ? 'Adding driver…' : 'Add Driver'}
              </button>
            </form>
          )}

          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Name', 'Email', 'Phone', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < drivers.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0B1220' }}>{d.full_name}</td>
                    <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{d.email}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#64748B' }}>{d.phone ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#DCFCE7', color: '#16A34A', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>ACTIVE</span>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>No drivers yet. Add one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
