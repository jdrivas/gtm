import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { CalendarCheck, ArrowRightLeft } from 'lucide-react';
import type { GameTicketDetail, Game } from './types';
import { fetchMyGames, fetchGames, releaseGameTickets } from './api';

interface GameGroup {
  game_pk: number;
  game?: Game;
  tickets: GameTicketDetail[];
}

export default function MyGames() {
  const { isAuthenticated } = useAuth0();
  const [tickets, setTickets] = useState<GameTicketDetail[]>([]);
  const [games, setGames] = useState<Record<number, Game>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([fetchMyGames(), fetchGames()])
      .then(([ticketData, gameList]) => {
        setTickets(ticketData);
        const map: Record<number, Game> = {};
        for (const g of gameList) map[g.game_pk] = g;
        setGames(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [isAuthenticated]);

  const grouped = useMemo(() => {
    const map = new Map<number, GameTicketDetail[]>();
    for (const t of tickets) {
      if (!map.has(t.game_pk)) map.set(t.game_pk, []);
      map.get(t.game_pk)!.push(t);
    }
    const groups: GameGroup[] = [];
    for (const [game_pk, tix] of map) {
      groups.push({ game_pk, game: games[game_pk], tickets: tix });
    }
    groups.sort((a, b) => {
      const da = a.game?.official_date ?? '';
      const db = b.game?.official_date ?? '';
      return da.localeCompare(db);
    });
    return groups;
  }, [tickets, games]);

  const handleRelease = async (gamePk: number) => {
    if (!confirm('Release all your seats for this game?')) return;
    try {
      await releaseGameTickets(gamePk);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isAuthenticated) {
    return <div className="text-center py-20 text-gray-500">Please log in to view your games.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-gray-500 text-lg">Loading your games…</div></div>;
  }

  if (error) {
    return <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">Error: {error}</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <CalendarCheck className="w-5 h-5 text-orange-500" />
        <h2 className="text-xl font-bold">My Games</h2>
        <span className="text-sm text-gray-500">({grouped.length} games, {tickets.length} tickets)</span>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No tickets assigned to you yet.</p>
          <p className="text-sm mt-1">Request tickets from the Schedule page, then wait for admin allocation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.game_pk} className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {g.game?.official_date ?? 'Unknown date'}
                    <span className="text-gray-400 mx-2">vs</span>
                    <span className="text-orange-400">{g.game?.away_team_name ?? 'Unknown'}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {g.tickets.map((t) => `${t.section}:${t.row}${t.seat}`).join(', ')}
                    <span className="ml-2">({g.tickets.length} {g.tickets.length === 1 ? 'seat' : 'seats'})</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRelease(g.game_pk)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Release
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
