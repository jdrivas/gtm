import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { CalendarDays, Armchair, LogIn, LogOut, Ticket, BarChart3, ShieldCheck, Menu, KeyRound } from 'lucide-react'
import { setTokenGetter, fetchMe } from './api'
import SchedulePage from './SchedulePage'
import SeatAdmin from './SeatAdmin'
import MyRequests from './MyRequests'
import AllocationDashboard from './AllocationDashboard'

function App() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTokenGetter(async () => {
      try {
        return await getAccessTokenSilently();
      } catch {
        return null;
      }
    });
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) { setUserRole(null); return; }
    fetchMe()
      .then((me) => setUserRole(me.role))
      .catch(() => setUserRole(null));
  }, [isAuthenticated]);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => setAppVersion(d.version)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const gtmConfig = (window as any).__GTM_CONFIG__ || {
    auth0_domain: import.meta.env.VITE_AUTH0_DOMAIN,
    auth0_client_id: import.meta.env.VITE_AUTH0_CLIENT_ID,
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`https://${gtmConfig.auth0_domain}/dbconnections/change_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: gtmConfig.auth0_client_id,
          email: user.email,
          connection: 'GTM-users',
        }),
      });
      const body = await res.text();
      console.log('Auth0 change_password response:', res.status, body);
      if (res.ok) {
        setPasswordMsg('Password reset email sent — check your inbox');
      } else {
        let detail = '';
        try { detail = JSON.parse(body).description; } catch { /* not JSON */ }
        if (!detail) detail = body || res.statusText || `HTTP ${res.status}`;
        setPasswordMsg(`Password reset failed: ${detail}`);
      }
    } catch (err) {
      console.error('Change password error:', err);
      setPasswordMsg(`Password reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setShowMenu(false);
    setTimeout(() => setPasswordMsg(null), 8000);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-950">
          <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-black text-lg select-none">
                SF
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  <span className="text-sky-300">Rivas-Yee</span>{' '}
                  <span className="text-orange-500">Giants Ticket Manager</span>
                </h1>
                <p className="text-xs text-gray-500">Season Ticket Management System</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-1">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-orange-600/20 text-orange-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`
                  }
                >
                  <CalendarDays className="w-4 h-4" />
                  Schedule
                </NavLink>
                {isAuthenticated && (
                  <>
                    <NavLink
                      to="/my/requests"
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-orange-600/20 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`
                      }
                    >
                      <Ticket className="w-4 h-4" />
                      Requests
                    </NavLink>
                    <NavLink
                      to="/admin/seats"
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-orange-600/20 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`
                      }
                    >
                      <Armchair className="w-4 h-4" />
                      Seats
                    </NavLink>
                    <NavLink
                      to="/admin/allocation"
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-orange-600/20 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`
                      }
                    >
                      <BarChart3 className="w-4 h-4" />
                      Allocation
                    </NavLink>
                  </>
                )}
              </nav>
              <div className="border-l border-gray-700 pl-4">
                {isLoading ? (
                  <span className="text-gray-500 text-sm">…</span>
                ) : isAuthenticated ? (
                  <div className="flex items-center gap-3">
                    {user?.picture && (
                      <img src={user.picture} alt="" className="w-7 h-7 rounded-full" />
                    )}
                    <span className="text-sm text-gray-300">{user?.name}</span>
                    {userRole === 'admin' && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-600/20 text-orange-400 border border-orange-800/50">
                        <ShieldCheck className="w-3 h-3" />
                        Admin
                      </span>
                    )}
                    {userRole && userRole !== 'admin' && (
                      <span className="text-[10px] text-gray-500">{userRole}</span>
                    )}
                    <div ref={menuRef} className="relative">
                      <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="flex items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                      >
                        <Menu className="w-4 h-4" />
                      </button>
                      {showMenu && (
                        <div className="absolute right-0 top-10 z-50 w-48 rounded-lg bg-gray-800 border border-gray-700 shadow-lg py-1">
                          <button
                            onClick={handleChangePassword}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Change Password
                          </button>
                          <button
                            onClick={() => { setShowMenu(false); logout({ logoutParams: { returnTo: window.location.origin } }); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Logout
                          </button>
                          {appVersion && (
                            <div className="border-t border-gray-700 mt-1 pt-1 px-3 py-1">
                              <span className="text-[10px] text-gray-500">v{appVersion}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => loginWithRedirect()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-orange-600 text-white hover:bg-orange-500 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Toast notification */}
        {passwordMsg && (
          <div className={`fixed top-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 shadow-lg text-sm flex items-start gap-3 ${
            passwordMsg.includes('sent')
              ? 'bg-green-900/90 border-green-700 text-green-200'
              : 'bg-red-900/90 border-red-700 text-red-200'
          }`}>
            <span className="flex-1">{passwordMsg}</span>
            <button onClick={() => setPasswordMsg(null)} className="text-current opacity-60 hover:opacity-100 font-bold">×</button>
          </div>
        )}

        {/* Main content */}
        <main className="max-w-[1600px] mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<SchedulePage userRole={userRole} />} />
            <Route path="/my/requests" element={<MyRequests />} />
            <Route path="/admin/seats" element={<SeatAdmin />} />
            <Route path="/admin/allocation" element={<AllocationDashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
