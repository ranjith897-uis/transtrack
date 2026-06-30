import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { Student, RouteSummary } from '@/types';

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [routeId, setRouteId] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [s, r] = await Promise.all([
      api.get<{ students: Student[] }>('/students'),
      api.get<{ routes: RouteSummary[] }>('/routes'),
    ]);
    setStudents(s.students);
    setRoutes(r.routes);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/students', {
        fullName,
        grade: grade || undefined,
        routeId: routeId || undefined,
        parentEmails: parentEmail ? [parentEmail] : [],
      });
      setFullName('');
      setGrade('');
      setRouteId('');
      setParentEmail('');
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add student');
    }
  }

  const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Students</h1>
          <p className="text-sm text-muted mt-0.5">{students.length} students on the roster</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Student'}
        </button>
      </div>

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
              <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="5th Grade"
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
              <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@email.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-route" />
              <p className="text-[11px] text-muted mt-1">Parent account must already exist with this email.</p>
            </div>
          </div>
          {error && <p className="text-sm text-alert">{error}</p>}
          <button type="submit" className="px-4 py-2 bg-route text-white text-sm font-medium rounded-lg hover:bg-route/90 transition-colors">
            Save Student
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-muted uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Grade</th>
              <th className="px-5 py-3 font-medium">Route</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3.5 font-medium text-ink">{s.full_name}</td>
                <td className="px-5 py-3.5 text-muted">{s.grade ?? '—'}</td>
                <td className="px-5 py-3.5 text-muted">{s.route_id ? routeNameById[s.route_id] ?? '—' : '—'}</td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={3} className="px-5 py-10 text-center text-muted text-sm">No students yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
