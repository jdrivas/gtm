import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { CalendarDays, Armchair } from 'lucide-react'
import SchedulePage from './SchedulePage'
import SeatAdmin from './SeatAdmin'

function App() {
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
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-[1600px] mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<SchedulePage />} />
            <Route path="/admin/seats" element={<SeatAdmin />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
