import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Ticket, CalendarDays, CheckCircle2, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import type { TicketRequest, Game, GameTicketDetail } from './types';
import { fetchMyRequests, fetchMyGames, fetchGames, releaseGameTickets, withdrawRequest } from './api';
import useAutoRefresh from './useAutoRefresh';

function formatDate(d: string) {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function seatLabel(t: GameTicketDetail) {
  return `${t.section}:${t.row}${t.seat}`;
}

export default function MyAllocations() {
  const { isAuthenticated } = useAuth0();
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [myTickets, setMyTickets] = useState<GameTicketDetail[]>([]);
  const [gameMap, setGameMap] = useState<Record<number, Game>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releaseConfirm, setReleaseConfirm] = useState<{ gamePk: number; opponent: string; count: number } | null>(null);
  const [withdrawConfirm, setWithdrawConfirm] = useState<{ requestId: number; opponent: string; seats: number } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const load = useCallback((silent = false) => {
    if (!isAuthenticated) return;
    if (!silent) setLoading(true);
    Promise.all([fetchMyRequests(), fetchMyGames(), fetchGames()])
      .then(([reqs, tickets, games]) => {
        setRequests(reqs);
        setMyTickets(tickets);
        const gm: Record<number, Game> = {};
        for (const g of games) gm[g.game_pk] = g;
        setGameMap(gm);
      })
      .catch((err) => setError(err.message))
      .finally(() => { if (!silent) setLoading(false); });
  }, [isAuthenticated]);

  useEffect(() => load(), [load]);
  useAutoRefresh(() => load(true));

  // Group tickets by game_pk
  const ticketsByGame = useMemo(() => {
    const m: Record<number, GameTicketDetail[]> = {};
    for (const t of myTickets) {
      if (!m[t.game_pk]) m[t.game_pk] = [];
      m[t.game_pk].push(t);
    }
    return m;
  }, [myTickets]);

  // Build combined rows: one per game where user has a request or allocated tickets
  const rows = useMemo(() => {
    const gamePks = new Set<number>();
    for (const r of requests) gamePks.add(r.game_pk);
    for (const t of myTickets) gamePks.add(t.game_pk);

    return Array.from(gamePks)
      .map((gamePk) => {
        const game = gameMap[gamePk];
        const req = requests.find((r) => r.game_pk === gamePk);
        const tickets = ticketsByGame[gamePk] || [];
        return {
          gamePk,
          game,
          officialDate: game?.official_date || '',
          opponent: game?.away_team_name || `Game ${gamePk}`,
          seatsRequested: req?.seats_requested ?? 0,
          requestId: req?.id ?? null,
          requestStatus: req?.status ?? null,
          seatsAllocated: tickets.length,
          tickets,
        };
      })
      .filter((r) => r.tickets.length > 0 || (r.requestStatus && r.requestStatus !== 'withdrawn'))
      .sort((a, b) => a.officialDate.localeCompare(b.officialDate));
  }, [requests, myTickets, gameMap, ticketsByGame]);

  // Summary stats
  const totalRequested = rows.reduce((s, r) => s + r.seatsRequested, 0);
  const totalAllocated = rows.reduce((s, r) => s + r.seatsAllocated, 0);
  const gamesWithTickets = rows.filter((r) => r.seatsAllocated > 0).length;

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-gray-500">
        Please log in to view your allocations.
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading allocations…</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Ticket className="w-5 h-5 text-orange-400" />
          My Allocations
        </h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="text-2xl font-bold text-white">{gamesWithTickets}</div>
          <div className="text-xs text-gray-400 mt-1">Games with tickets</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="text-2xl font-bold text-white">{totalAllocated}</div>
          <div className="text-xs text-gray-400 mt-1">Seats allocated</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="text-2xl font-bold text-white">{totalRequested}</div>
          <div className="text-xs text-gray-400 mt-1">Seats requested</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No requests or allocations yet.
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Opponent</th>
                <th className="text-center px-4 py-3">Requested</th>
                <th className="text-center px-4 py-3">Allocated</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Seats</th>
                <th className="text-center px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const fulfilled = row.seatsAllocated >= row.seatsRequested && row.seatsRequested > 0;
                const partial = row.seatsAllocated > 0 && row.seatsAllocated < row.seatsRequested;
                const pending = row.seatsRequested > 0 && row.seatsAllocated === 0;

                return (
                  <tr key={row.gamePk} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-gray-500" />
                        {row.officialDate ? formatDate(row.officialDate) : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {row.opponent}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {row.seatsRequested || '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      <span className={row.seatsAllocated > 0 ? 'text-green-400' : 'text-gray-500'}>
                        {row.seatsAllocated || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {fulfilled && (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Fulfilled
                        </span>
                      )}
                      {partial && (
                        <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Partial
                        </span>
                      )}
                      {pending && (
                        <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                      {!row.seatsRequested && row.seatsAllocated > 0 && (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {row.tickets.length > 0
                        ? row.tickets.map((t) => seatLabel(t)).join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.tickets.length > 0 && (
                        <button
                          onClick={() => setReleaseConfirm({ gamePk: row.gamePk, opponent: row.opponent, count: row.tickets.length })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                          title="Release tickets"
                        >
                          <Trash2 className="w-3 h-3" />
                          Release
                        </button>
                      )}
                      {row.tickets.length === 0 && row.requestId && row.requestStatus === 'pending' && (
                        <button
                          onClick={() => setWithdrawConfirm({ requestId: row.requestId!, opponent: row.opponent, seats: row.seatsRequested })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                          title="Withdraw request"
                        >
                          <Trash2 className="w-3 h-3" />
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Withdraw confirmation modal */}
      {withdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-2">Withdraw Request?</h3>
            <p className="text-gray-300 text-sm mb-4">
              Withdraw your request for {withdrawConfirm.seats} seat{withdrawConfirm.seats !== 1 ? 's' : ''} for <span className="text-white font-medium">{withdrawConfirm.opponent}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setWithdrawConfirm(null)}
                disabled={withdrawing}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setWithdrawing(true);
                  try {
                    await withdrawRequest(withdrawConfirm.requestId);
                    setWithdrawConfirm(null);
                    load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                    setWithdrawConfirm(null);
                  } finally {
                    setWithdrawing(false);
                  }
                }}
                disabled={withdrawing}
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {withdrawing ? 'Withdrawing…' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Release confirmation modal */}
      {releaseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-2">Release Tickets?</h3>
            <p className="text-gray-300 text-sm mb-4">
              Release {releaseConfirm.count} ticket{releaseConfirm.count !== 1 ? 's' : ''} for <span className="text-white font-medium">{releaseConfirm.opponent}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReleaseConfirm(null)}
                disabled={releasing}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setReleasing(true);
                  try {
                    await releaseGameTickets(releaseConfirm.gamePk);
                    setReleaseConfirm(null);
                    load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                    setReleaseConfirm(null);
                  } finally {
                    setReleasing(false);
                  }
                }}
                disabled={releasing}
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {releasing ? 'Releasing…' : 'Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
