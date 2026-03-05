import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { RefreshCw } from 'lucide-react';
import type { Game, TicketSummary, TicketRequest, GameTicketDetail } from './types';
import { fetchGames, fetchTicketSummary, fetchMyRequests, fetchMyGames, scrapeSchedule } from './api';
import ScheduleTable from './ScheduleTable';

interface SchedulePageProps {
  userRole: string | null;
}

export default function SchedulePage({ userRole }: SchedulePageProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [ticketSummary, setTicketSummary] = useState<Record<number, TicketSummary>>({});
  const [myRequests, setMyRequests] = useState<TicketRequest[]>([]);
  const [myGames, setMyGames] = useState<GameTicketDetail[]>([]);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  const loadData = () => {
    // Wait for Auth0 to finish initializing before fetching
    if (authLoading) return;

    const fetches: [Promise<Game[]>, Promise<TicketSummary[]>, Promise<TicketRequest[]>, Promise<GameTicketDetail[]>] = [
      fetchGames(),
      fetchTicketSummary(),
      isAuthenticated ? fetchMyRequests().catch(() => []) : Promise.resolve([]),
      isAuthenticated ? fetchMyGames().catch(() => []) : Promise.resolve([]),
    ];

    Promise.all(fetches)
      .then(([gameData, summaryData, requestData, gameTicketData]) => {
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
        setMyRequests(requestData);
        setMyGames(gameTicketData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [isAuthenticated, authLoading]);

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

  const handleScrape = async () => {
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
  };

  return (
    <div>
      <ScheduleTable
        games={seasonGames}
        seasons={seasons}
        selectedSeason={selectedSeason}
        onSeasonChange={setSelectedSeason}
        ticketSummary={ticketSummary}
        userRole={userRole}
        isAuthenticated={isAuthenticated}
        myRequests={myRequests}
        myGames={myGames}
        onDataRefresh={loadData}
        onScrape={handleScrape}
        scraping={scraping}
        scrapeResult={scrapeResult}
      />
    </div>
  );
}
