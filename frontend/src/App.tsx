import { useEffect, useState, useMemo } from 'react'
import type { Game } from './types'
import { fetchGames } from './api'
import ScheduleTable from './ScheduleTable'

function App() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<string>('')

  useEffect(() => {
    fetchGames()
      .then((data) => {
        setGames(data)
        const seasons = [...new Set(data.map((g) => g.season))].sort()
        if (seasons.length > 0) {
          setSelectedSeason(seasons[seasons.length - 1])
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const seasons = useMemo(
    () => [...new Set(games.map((g) => g.season))].sort(),
    [games],
  )

  const seasonGames = useMemo(
    () => games.filter((g) => g.season === selectedSeason),
    [games, selectedSeason],
  )

  return (
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
          <div className="text-xs text-gray-600">
            {games.length} games loaded
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500 text-lg">Loading schedule…</div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">
            Error loading games: {error}
          </div>
        )}

        {!loading && !error && games.length > 0 && (
          <ScheduleTable
            games={seasonGames}
            seasons={seasons}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
          />
        )}

        {!loading && !error && games.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No games found.</p>
            <p className="text-sm mt-2">Run <code className="text-orange-400">gtm scrape-schedule</code> to load schedule data.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
