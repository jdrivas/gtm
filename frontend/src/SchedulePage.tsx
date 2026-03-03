import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Ticket, RefreshCw } from 'lucide-react';
import type { Game, TicketSummary, TicketRequest } from './types';
import { fetchGames, fetchTicketSummary, fetchMyRequests, scrapeSchedule } from './api';
import ScheduleTable from './ScheduleTable';
import RequestPanel from './RequestPanel';

interface SchedulePageProps {
  userRole: string | null;
}

export default function SchedulePage({ userRole }: SchedulePageProps) {
  const { isAuthenticated } = useAuth0();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [ticketSummary, setTicketSummary] = useState<Record<number, TicketSummary>>({});
  const [showRequestPanel, setShowRequestPanel] = useState(false);
  const [myRequests, setMyRequests] = useState<TicketRequest[]>([]);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

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
        {userRole === 'admin' ? (
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={async () => {
                setScraping(true);
                setScrapeResult(null);
                try {
                  const r = await scrapeSchedule();
                  setScrapeResult(`Updated: ${r.games} games, ${r.promotions} promotions, ${r.tickets} tickets`);
                  loadData();
                } catch (e: any) {
                  setScrapeResult(`Error: ${e.message}`);
                } finally {
                  setScraping(false);
                }
              }}
              disabled={scraping}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-orange-600 text-white hover:bg-orange-500 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scraping ? 'animate-spin' : ''}`} />
              {scraping ? 'Scraping…' : 'Scrape Schedule'}
            </button>
            {scrapeResult && (
              <span className={`text-xs ${scrapeResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {scrapeResult}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm mt-2">
            Run <code className="text-orange-400">gtm scrape-schedule</code> to load schedule data.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {isAuthenticated && !showRequestPanel && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {userRole === 'admin' && (
              <>
                <button
                  onClick={async () => {
                    setScraping(true);
                    setScrapeResult(null);
                    try {
                      const r = await scrapeSchedule();
                      setScrapeResult(`Updated: ${r.games} games, ${r.promotions} promotions, ${r.tickets} tickets`);
                      loadData();
                    } catch (e: any) {
                      setScrapeResult(`Error: ${e.message}`);
                    } finally {
                      setScraping(false);
                    }
                  }}
                  disabled={scraping}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${scraping ? 'animate-spin' : ''}`} />
                  {scraping ? 'Scraping…' : 'Scrape Schedule'}
                </button>
                {scrapeResult && (
                  <span className={`text-xs ${scrapeResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {scrapeResult}
                  </span>
                )}
              </>
            )}
          </div>
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
