import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Ticket, Trash2, Edit3, Check, X } from 'lucide-react';
import type { TicketRequest, Game } from './types';
import { fetchMyRequests, fetchGames, withdrawRequest, updateRequest } from './api';

export default function MyRequests() {
  const { isAuthenticated } = useAuth0();
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [games, setGames] = useState<Record<number, Game>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSeats, setEditSeats] = useState(1);

  const load = () => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([fetchMyRequests(), fetchGames()])
      .then(([reqs, gameList]) => {
        setRequests(reqs);
        const map: Record<number, Game> = {};
        for (const g of gameList) map[g.game_pk] = g;
        setGames(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [isAuthenticated]);

  const handleWithdraw = async (id: number) => {
    try {
      await withdrawRequest(id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      await updateRequest(id, editSeats);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isAuthenticated) {
    return <div className="text-center py-20 text-gray-500">Please log in to view your requests.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-gray-500 text-lg">Loading requests…</div></div>;
  }

  if (error) {
    return <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">Error: {error}</div>;
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'approved': return 'text-green-400';
      case 'declined': return 'text-red-400';
      case 'withdrawn': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Ticket className="w-5 h-5 text-orange-500" />
        <h2 className="text-xl font-bold">My Ticket Requests</h2>
        <span className="text-sm text-gray-500">({requests.length})</span>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No requests yet.</p>
          <p className="text-sm mt-1">Go to the Schedule page to request tickets for games.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Opponent</th>
                <th className="py-2 px-3 text-center">Seats</th>
                <th className="py-2 px-3 text-center">Approved</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Notes</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const game = games[r.game_pk];
                return (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-3">{game?.official_date ?? r.game_pk}</td>
                    <td className="py-2 px-3">{game?.away_team_name ?? '—'}</td>
                    <td className="py-2 px-3 text-center">
                      {editingId === r.id ? (
                        <select
                          value={editSeats}
                          onChange={(e) => setEditSeats(Number(e.target.value))}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-white text-sm"
                        >
                          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (
                        r.seats_requested
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">{r.seats_approved > 0 ? r.seats_approved : '—'}</td>
                    <td className={`py-2 px-3 font-medium ${statusColor(r.status)}`}>{r.status}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{r.notes ?? ''}</td>
                    <td className="py-2 px-3">
                      {r.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          {editingId === r.id ? (
                            <>
                              <button onClick={() => handleUpdate(r.id)} className="p-1 rounded hover:bg-green-900/30 text-green-400" title="Save">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-gray-800 text-gray-400" title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingId(r.id); setEditSeats(r.seats_requested); }}
                                className="p-1 rounded hover:bg-gray-800 text-gray-400"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleWithdraw(r.id)} className="p-1 rounded hover:bg-red-900/30 text-red-400" title="Withdraw">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
