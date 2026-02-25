import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState<{ status: string; message: string; version: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-orange-500">
          SF Giants Ticket Manager
        </h1>
        <p className="text-xl text-gray-400">Season Ticket Management System</p>

        <div className="mt-8 p-6 rounded-lg bg-gray-900 border border-gray-800 max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-orange-400 mb-2">API Health Check</h2>
          {error && <p className="text-red-400">Error: {error}</p>}
          {health ? (
            <div className="space-y-1 text-left">
              <p><span className="text-gray-500">Status:</span> <span className="text-green-400">{health.status}</span></p>
              <p><span className="text-gray-500">Message:</span> {health.message}</p>
              <p><span className="text-gray-500">Version:</span> <span className="text-gray-400">{health.version}</span></p>
            </div>
          ) : (
            !error && <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
