import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Ticket } from 'lucide-react';
import type { Game, TicketSummary, TicketRequest } from './types';
import { fetchGames, fetchTicketSummary, fetchMyRequests } from './api';
import ScheduleTable from './ScheduleTable';
import RequestPanel from './RequestPanel';

export default function SchedulePage() {
  const { isAuthenticated } = useAuth0();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [ticketSummary, setTicketSummary] = useState<Record<number, TicketSummary>>({});
  const [showRequestPanel, setShowRequestPanel] = useState(false);
  const [myRequests, setMyRequests] = useState<TicketRequest[]>([]);

  const loadData = () => {
    Promise.all([fetchGames(), fetchTicketSummary()])
      .then(([gameData, summaryData]) => {
        setGames(gameData);
        const seasons = [...new Set(gameData.map((g) => g.season))].sort();
        if (seasons.length > 0) {
          setSelectedSeason(seasons[seasons.length - 1]);
        }
        const map: Record<number, TicketSummary> = {};
        for (const s of summaryData) {
          map[s.game_pk] = s;
        }
        setTicketSummary(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Fetch requests separately — a 401 during login redirect shouldn't fail the page
    if (isAuthenticated) {
      fetchMyRequests()
        .then(setMyRequests)
        .catch(() => {}); // silently ignore; user can see requests on the Requests page
    }
  };

  useEffect(loadData, [isAuthenticated]);

  const seasons = useMemo(
    () => [...new Set(games.map((g) => g.season))].sort(),
    [games],
  );

  const seasonGames = useMemo(
    () => games.filter((g) => g.season === selectedSeason),
    [games, selectedSeason],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-lg">Loading schedule…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">
        Error loading games: {error}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg">No games found.</p>
        <p className="text-sm mt-2">
          Run <code className="text-orange-400">gtm scrape-schedule</code> to load schedule data.
        </p>
      </div>
    );
  }

  return (
    <div>
      {isAuthenticated && !showRequestPanel && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowRequestPanel(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-orange-600 text-white hover:bg-orange-500 transition-colors"
          >
            <Ticket className="w-4 h-4" />
            Request Tickets
          </button>
        </div>
      )}

      {showRequestPanel && (
        <RequestPanel
          games={seasonGames}
          existingRequests={myRequests}
          onClose={() => setShowRequestPanel(false)}
          onSubmitted={() => {
            setShowRequestPanel(false);
            loadData();
          }}
        />
      )}

      <ScheduleTable
        games={seasonGames}
        seasons={seasons}
        selectedSeason={selectedSeason}
        onSeasonChange={setSelectedSeason}
        ticketSummary={ticketSummary}
      />
    </div>
  );
}
