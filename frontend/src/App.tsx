import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { CalendarDays, Armchair, LogIn, LogOut, Ticket, CalendarCheck, BarChart3, ShieldCheck } from 'lucide-react'
import { setTokenGetter, fetchMe } from './api'
import SchedulePage from './SchedulePage'
import SeatAdmin from './SeatAdmin'
import MyRequests from './MyRequests'
import MyGames from './MyGames'
import AllocationDashboard from './AllocationDashboard'
import GameAllocation from './GameAllocation'

function App() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    setTokenGetter(async () => {
      if (!isAuthenticated) return null;
      try {
        return await getAccessTokenSilently();
      } catch {
        return null;
      }
    });
  }, [isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) { setUserRole(null); return; }
    fetchMe()
      .then((me) => setUserRole(me.role))
      .catch(() => setUserRole(null));
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-950">
          <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-black text-lg">
                SF
              </div>
              <div>
                <h1 className="text-xl font-bold text-orange-500">
                  Giants Ticket Manager
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
                      to="/my/games"
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-orange-600/20 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`
                      }
                    >
                      <CalendarCheck className="w-4 h-4" />
                      My Games
                    </NavLink>
                  </>
                )}
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
                {isAuthenticated && (
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
                    <button
                      onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Logout
                    </button>
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

        {/* Main content */}
        <main className="max-w-[1600px] mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<SchedulePage />} />
            <Route path="/my/requests" element={<MyRequests />} />
            <Route path="/my/games" element={<MyGames />} />
            <Route path="/admin/seats" element={<SeatAdmin />} />
            <Route path="/admin/allocation" element={<AllocationDashboard />} />
            <Route path="/admin/allocation/:gamePk" element={<GameAllocation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
