import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, XCircle } from 'lucide-react';
import type { GameAllocationDetail, GameTicketWithUser, RequestWithUser } from './types';
import { fetchGameAllocation, allocateTickets, revokeTicket, fetchMe } from './api';

export default function GameAllocation() {
  const { isAuthenticated } = useAuth0();
  const { gamePk } = useParams<{ gamePk: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<GameAllocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [assigningTicketId, setAssigningTicketId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [assignRequestId, setAssignRequestId] = useState<number | null>(null);

  const load = () => {
    if (!isAuthenticated || !gamePk) return;
    setLoading(true);
    fetchMe()
      .then((me) => {
        setIsAdmin(me.role === 'admin');
        if (me.role !== 'admin') {
          setLoading(false);
          return;
        }
        return fetchGameAllocation(Number(gamePk))
          .then(setData)
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(load, [isAuthenticated, gamePk]);

  const handleAssign = async (ticketId: number) => {
    if (!assignUserId) return;
    try {
      await allocateTickets([{
        game_ticket_id: ticketId,
        user_id: assignUserId,
        request_id: assignRequestId ?? undefined,
      }]);
      setAssigningTicketId(null);
      setAssignUserId(null);
      setAssignRequestId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRevoke = async (ticketId: number) => {
    if (!confirm('Revoke this seat assignment?')) return;
    try {
      await revokeTicket(ticketId);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isAuthenticated) {
    return <div className="text-center py-20 text-gray-500">Please log in.</div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-gray-500 text-lg">Loading…</div></div>;
  }
  if (error) {
    return <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">Error: {error}</div>;
  }
  if (!isAdmin || !data) {
    return <div className="text-center py-20 text-gray-500">Admin access required.</div>;
  }

  const { game, tickets, requests } = data;

  // Collect unique users from requests for the assign dropdown
  const requestUsers = [...new Map(requests.map((r) => [r.user_id, r])).values()];

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'approved': return 'text-green-400';
      case 'declined': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate('/admin/allocation')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-bold">
          {game.official_date}
          <span className="text-gray-400 mx-2">vs</span>
          <span className="text-orange-400">{game.away_team_name}</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">{game.venue_name} · {game.day_night ?? ''}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Seats */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Seats ({tickets.length})</h3>
          <div className="space-y-2">
            {tickets.map((t: GameTicketWithUser) => (
              <div key={t.id} className="border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm">{t.section}:{t.row}{t.seat}</span>
                  {t.status === 'assigned' ? (
                    <span className="ml-2 text-sm text-green-400">→ {t.assigned_user_name}</span>
                  ) : (
                    <span className="ml-2 text-sm text-gray-500">available</span>
                  )}
                </div>
                <div>
                  {t.status === 'available' && (
                    assigningTicketId === t.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={assignUserId ?? ''}
                          onChange={(e) => {
                            const uid = Number(e.target.value);
                            setAssignUserId(uid || null);
                            // Auto-select matching request
                            const match = requests.find((r) => r.user_id === uid && r.status === 'pending');
                            setAssignRequestId(match?.id ?? null);
                          }}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
                        >
                          <option value="">Select user…</option>
                          {requestUsers.map((r) => (
                            <option key={r.user_id} value={r.user_id}>{r.user_name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(t.id)}
                          disabled={!assignUserId}
                          className="px-2 py-1 rounded text-xs bg-green-700 text-white hover:bg-green-600 disabled:opacity-50"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => { setAssigningTicketId(null); setAssignUserId(null); }}
                          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningTicketId(t.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-green-400 hover:bg-green-900/20"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Assign
                      </button>
                    )
                  )}
                  {t.status === 'assigned' && (
                    <button
                      onClick={() => handleRevoke(t.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requests */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Requests ({requests.length})</h3>
          {requests.length === 0 ? (
            <p className="text-gray-500 text-sm">No requests for this game.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r: RequestWithUser) => (
                <div key={r.id} className="border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{r.user_name}</span>
                      <span className="text-gray-400 ml-2">wants {r.seats_requested} seat{r.seats_requested > 1 ? 's' : ''}</span>
                      {r.seats_approved > 0 && (
                        <span className="text-green-400 ml-2">(got {r.seats_approved})</span>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span>
                  </div>
                  {r.notes && <p className="text-xs text-gray-500 mt-1">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
