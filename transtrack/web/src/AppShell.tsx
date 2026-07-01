import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth-store';

const NAV_ITEMS = [
  { to: '/', label: 'Live Map', icon: MapIcon },
  { to: '/fleet', label: 'Fleet', icon: BusIcon },
  { to: '/routes', label: 'Routes', icon: RouteIcon },
  { to: '/students', label: 'Students', icon: UsersIcon },
  { to: '/trips', label: 'Trips', icon: ClockIcon },
  { to: '/import', label: 'Import Excel', icon: ImportIcon },
];

export function AppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-canvas">
      <aside className="w-60 flex-shrink-0 bg-ink text-white flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-route flex items-center justify-center">
            <span className="text-xs font-bold">TT</span>
          </div>
          <span className="font-semibold tracking-tight">TransTrack</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-white/50 truncate">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-1 px-3 py-2 text-left text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6-13l6 3m0 0l5.447-2.724A1 1 0 0121 5.618v10.764a1 1 0 01-.553.894L15 20m0-13v13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 16V8a2 2 0 012-2h12a2 2 0 012 2v8m-16 0a2 2 0 002 2h12a2 2 0 002-2m-16 0H3m17 0h1M7 19a1 1 0 11-2 0 1 1 0 012 0zm12 0a1 1 0 11-2 0 1 1 0 012 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RouteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 7.5C12 11 12 13 15.5 16.5" strokeLinecap="round" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 014-4h2a4 4 0 014 4v2zm6-8a4 4 0 100-8 4 4 0 000 8zm-9 0a3 3 0 100-6 3 3 0 000 6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ImportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4m0 12l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}
