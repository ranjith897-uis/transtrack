import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Student, RouteSummary } from '@/types';

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Add form state
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [routeId, setRouteId] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editRouteId, setEditRouteId] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [s, r] = await Promise.all([
      api.get<{ students: Student[] }>('/students'),
      api.get<{ routes: RouteSummary[] }>('/routes'),
    ]);
    setStudents(s.students);
    setRoutes(r.routes);
  }

  useEffect(() => { refresh(); }, []);

  const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));

  // ── Add new student ──────────────────────────────────────────
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/students', {
        fullName,
        grade: grade || undefined,
        routeId: routeId || undefined,
        parentEmails: parentEmail ? [parentEmail] : [],
      });
      setFullName(''); setGrade(''); setRouteId(''); setParentEmail('');
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add student');
    } finally {
      setSaving(false);
    }
  }

  // ── Open edit panel ──────────────────────────────────────────
  function startEdit(student: Student) {
    setEditingStudent(student);
    setEditName(student.full_name);
    setEditGrade(student.grade ?? '');
    setEditRouteId(student.route_id ?? '');
    setError(null);
  }

  // ── Save edits ───────────────────────────────────────────────
  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/students/${editingStudent.id}`, {
        fullName: editName,
        grade: editGrade || undefined,
        routeId: editRouteId || null,
      });
      setEditingStudent(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete student ───────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await api.delete(`/students/${id}`);
      setDeleteConfirmId(null);
      if (editingStudent?.id === id) setEditingStudent(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete student');
    }
  }

  return (
    <div className="p-8 max-w-5xl flex gap-8">
      {/* ── Main table ── */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Students</h1>
            <p className="text-sm text-muted mt-0.5">{students.length} students on the roster</p>
          </div>
          <button
            onClick={() => { setShowForm((s) => !s); setEditingStudent(null); }}
            className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Student'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 mb-4 flex justify-between">
            <p className="text-sm text-alert">{error}</p>
            <button onClick={() => setError(null)} className="text-muted text-xs ml-4">✕</button>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Grade</label>
                <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 5th Grade"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Route</label>
                <select value={routeId} onChange={(e) => setRouteId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
                  <option value="">No route assigned</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Parent Email</label>
                <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@email.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
                <p className="text-[11px] text-muted mt-1">Parent account must already exist with this email.</p>
              </div>
            </div>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Student'}
            </button>
          </form>
        )}

        {/* Students table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Grade</th>
                <th className="px-5 py-3 font-medium">Route</th>
                <th className="px-5 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}
                  className={`border-b border-slate-50 last:border-0 ${editingStudent?.id === s.id ? 'bg-route/5' : ''}`}>
                  <td className="px-5 py-3.5 font-medium text-ink">{s.full_name}</td>
                  <td className="px-5 py-3.5 text-muted">{s.grade ?? '—'}</td>
                  <td className="px-5 py-3.5 text-muted">
                    {s.route_id ? routeNameById[s.route_id] ?? '—' : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { startEdit(s); setShowForm(false); }}
                        className="text-xs text-route font-medium hover:underline"
                      >
                        Edit
                      </button>
                      {deleteConfirmId === s.id ? (
                        <span className="flex items-center gap-1.5">
                          <button onClick={() => handleDelete(s.id)}
                            className="text-xs font-medium text-alert hover:underline">Yes</button>
                          <span className="text-muted text-xs">·</span>
                          <button onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-muted hover:underline">No</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(s.id)}
                          className="text-xs text-muted hover:text-alert"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-muted text-sm">
                    No students yet. Add your first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit panel ── */}
      {editingStudent && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink">Edit Student</h3>
              <button onClick={() => setEditingStudent(null)} className="text-muted text-sm hover:text-ink">✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Full Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Grade</label>
                <input value={editGrade} onChange={(e) => setEditGrade(e.target.value)}
                  placeholder="e.g. 5th Grade"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Route</label>
                <select value={editRouteId} onChange={(e) => setEditRouteId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route">
                  <option value="">No route assigned</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setEditingStudent(null)}
                  className="px-3 py-2 text-sm text-muted hover:text-ink rounded-lg border border-slate-200">
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
