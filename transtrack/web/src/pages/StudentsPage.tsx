import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Student, RouteSummary } from '@/types';

export function StudentsPage() {
  const [students, setStudents]     = useState<Student[]>([]);
  const [routes, setRoutes]         = useState<RouteSummary[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // Add form
  const [addName, setAddName]       = useState('');
  const [addPhone, setAddPhone]     = useState('');
  const [addRouteId, setAddRouteId] = useState('');

  // Edit form
  const [editName, setEditName]     = useState('');
  const [editRouteId, setEditRouteId] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #E2E8F0', fontSize: 14, color: '#0B1220',
    outline: 'none', boxSizing: 'border-box',
  };

  async function refresh() {
    const [s, r] = await Promise.all([
      api.get<{ students: Student[] }>('/students'),
      api.get<{ routes: RouteSummary[] }>('/routes'),
    ]);
    setStudents(s.students);
    setRoutes(r.routes);
  }
  useEffect(() => { refresh(); }, []);

  const routeName = (id: string | null) => routes.find(r => r.id === id)?.name ?? '—';

  async function handleAdd(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await api.post('/students', {
        fullName: addName,
        routeId: addRouteId || undefined,
        parentEmails: [],
      });
      // Also register parent account by phone
      if (addPhone.trim()) {
        const normalizedPhone = addPhone.replace(/[\s\-]/g, '').replace(/^\+?91/, '');
        const syntheticEmail = `${normalizedPhone}@ntr.transtrack`;
        // Create parent via the students/parents endpoint
        try {
          await api.post('/students/parents', {
            fullName: `Parent of ${addName}`,
            email: syntheticEmail,
            phone: normalizedPhone,
            password: normalizedPhone,
          });
        } catch {
          // Parent may already exist — that's fine
        }
      }
      setAddName(''); setAddPhone(''); setAddRouteId('');
      setShowForm(false); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  function startEdit(s: Student) {
    setEditingId(s.id); setEditName(s.full_name); setEditRouteId(s.route_id ?? '');
    setShowForm(false);
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault(); if (!editingId) return;
    setError(null); setSaving(true);
    try {
      await api.patch(`/students/${editingId}`, { fullName: editName, routeId: editRouteId || null });
      setEditingId(null); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await api.delete(`/students/${id}`); setDeleteId(null); if (editingId === id) setEditingId(null); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', gap: 32 }}>
      {/* Main */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220' }}>Students</h1>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{students.length} students on the roster</p>
          </div>
          <button onClick={() => { setShowForm(s => !s); setEditingId(null); }}
            style={{ padding: '10px 20px', background: '#0B1220', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {showForm ? 'Cancel' : '+ Add Student'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#DC2626', fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
            {error} <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleAdd} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <p style={{ fontWeight: 600, color: '#0B1220', marginBottom: 16, fontSize: 15 }}>Add Student</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Student Full Name *</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Rohan Sharma" required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Parent Mobile Number</label>
                <input value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="9876543210" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Parent logs in with this number on the mobile app</p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Route</label>
                <select value={addRouteId} onChange={e => setAddRouteId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">No route assigned</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving}
              style={{ padding: '10px 24px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {saving ? 'Saving…' : 'Save Student'}
            </button>
          </form>
        )}

        {/* Table */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Name', 'Route', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < students.length - 1 ? '1px solid #F1F5F9' : 'none', background: editingId === s.id ? '#EFF6FF' : 'white' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0B1220' }}>{s.full_name}</td>
                  <td style={{ padding: '12px 16px', color: '#64748B' }}>{routeName(s.route_id)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2563EB', fontWeight: 600 }}>Edit</button>
                      {deleteId === s.id ? (
                        <span style={{ fontSize: 13 }}>
                          <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 600, fontSize: 13 }}>Yes</button>
                          {' · '}
                          <button onClick={() => setDeleteId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13 }}>No</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#94A3B8' }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>No students yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit panel */}
      {editingId && (
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, position: 'sticky', top: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, color: '#0B1220', fontSize: 15 }}>Edit Student</p>
              <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18 }}>✕</button>
            </div>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Full Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Route</label>
                <select value={editRouteId} onChange={e => setEditRouteId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">No route assigned</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingId(null)} style={{ padding: '10px 14px', background: 'white', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
