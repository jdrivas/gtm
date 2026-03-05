import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Ticket, Check, X, Lock } from 'lucide-react';
import type { GameAllocationDetail, GameTicketWithUser, RequestWithUser } from './types';
import { fetchGameAllocation, allocateTickets, revokeTicket, fetchMe } from './api';

function seatLabel(t: GameTicketWithUser) {
  return `${t.section}:${t.row}${t.seat}`;
}

export default function GameAllocation() {
  const { isAuthenticated } = useAuth0();
  const { gamePk } = useParams<{ gamePk: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<GameAllocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Seat picker popup state
  const [pickerUserId, setPickerUserId] = useState<number | null>(null);
  const [pickerRequestId, setPickerRequestId] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<number, 'assign' | 'revoke'>>({});
  const [saving, setSaving] = useState(false);

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

  // Derived data
  const { game, tickets, requests } = data ?? { game: null, tickets: [] as GameTicketWithUser[], requests: [] as RequestWithUser[] };

  const totalSeats = tickets.length;
  const assignedSeats = tickets.filter((t) => t.status === 'assigned').length;
  const availableSeats = totalSeats - assignedSeats;
  const totalRequested = requests.reduce((s, r) => s + r.seats_requested, 0);

  // Map: userId -> tickets assigned to them
  const userTicketsMap = useMemo(() => {
    const m: Record<number, GameTicketWithUser[]> = {};
    for (const t of tickets) {
      if (t.assigned_to != null) {
        if (!m[t.assigned_to]) m[t.assigned_to] = [];
        m[t.assigned_to].push(t);
      }
    }
    return m;
  }, [tickets]);

  // Open the seat picker for a user
  const openPicker = (userId: number, requestId: number) => {
    setPickerUserId(userId);
    setPickerRequestId(requestId);
    setPendingChanges({});
  };

  const closePicker = () => {
    setPickerUserId(null);
    setPickerRequestId(null);
    setPendingChanges({});
  };

  // Toggle a seat in the picker
  const toggleSeat = (ticket: GameTicketWithUser) => {
    if (pickerUserId == null) return;

    setPendingChanges((prev) => {
      const next = { ...prev };
      if (ticket.status === 'available') {
        // Available seat: toggle assign
        if (next[ticket.id] === 'assign') {
          delete next[ticket.id];
        } else {
          next[ticket.id] = 'assign';
        }
      } else if (ticket.status === 'assigned' && ticket.assigned_to === pickerUserId) {
        // This user's seat: toggle revoke
        if (next[ticket.id] === 'revoke') {
          delete next[ticket.id];
        } else {
          next[ticket.id] = 'revoke';
        }
      }
      return next;
    });
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const handleSaveChanges = async () => {
    if (!pickerUserId || !hasPendingChanges) return;
    setSaving(true);
    try {
      // Process revokes first
      for (const [ticketIdStr, action] of Object.entries(pendingChanges)) {
        if (action === 'revoke') {
          await revokeTicket(Number(ticketIdStr));
        }
      }
      // Process assigns
      const assigns = Object.entries(pendingChanges)
        .filter(([, action]) => action === 'assign')
        .map(([ticketIdStr]) => ({
          game_ticket_id: Number(ticketIdStr),
          user_id: pickerUserId,
          request_id: pickerRequestId ?? undefined,
        }));
      if (assigns.length > 0) {
        await allocateTickets(assigns);
      }
      closePicker();
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
  if (!isAdmin || !data || !game) {
    return <div className="text-center py-20 text-gray-500">Admin access required.</div>;
  }

  return (
    <div>
      <button
        onClick={() => navigate('/admin/allocation')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Game header */}
      <div className="mb-2">
        <h2 className="text-xl font-bold">
          {game.official_date}
          <span className="text-gray-400 mx-2">vs</span>
          <span className="text-orange-400">{game.away_team_name}</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">{game.venue_name} · {game.day_night ?? ''}</p>
      </div>

      {/* Running totals */}
      <div className="mb-6 text-xs text-gray-400 flex gap-6">
        <span>Seats: <span className="text-gray-300 font-medium">{totalSeats}</span></span>
        <span>Assigned: <span className="text-green-400 font-medium">{assignedSeats}</span></span>
        <span>Available: <span className={`font-medium ${availableSeats > 0 ? 'text-blue-400' : 'text-gray-500'}`}>{availableSeats}</span></span>
        <span>Requested: <span className={`font-medium ${totalRequested > availableSeats ? 'text-yellow-400' : 'text-gray-300'}`}>{totalRequested}</span></span>
      </div>

      {/* Requests table */}
      {requests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No requests for this game.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3 text-center">Available</th>
                <th className="py-2 px-3 text-center">Allocated</th>
                <th className="py-2 px-3">Seats</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r: RequestWithUser) => {
                const userTickets = userTicketsMap[r.user_id] ?? [];
                const allocated = userTickets.length;
                const fulfilled = allocated >= r.seats_requested;

                return (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-3">
                      <span className="font-medium">{r.user_name}</span>
                      {r.notes && <span className="text-gray-500 text-xs ml-2">{r.notes}</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs ${availableSeats > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                        {availableSeats}/{totalSeats}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs font-medium ${
                        allocated === 0
                          ? 'text-gray-500'
                          : fulfilled
                            ? 'text-green-400'
                            : 'text-yellow-400'
                      }`}>
                        {allocated}/{r.seats_requested}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {userTickets.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {userTickets.map((t) => (
                            <span key={t.id} className="font-mono text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/50">
                              {seatLabel(t)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => openPicker(r.user_id, r.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-orange-400 hover:bg-orange-900/20 transition-colors"
                      >
                        <Ticket className="w-3.5 h-3.5" /> Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Seat Picker Modal ===== */}
      {pickerUserId != null && (() => {
        const pickerUser = requests.find((r) => r.user_id === pickerUserId);
        const userName = pickerUser?.user_name ?? 'User';
        const requested = pickerUser?.seats_requested ?? 0;
        const currentlyAssigned = (userTicketsMap[pickerUserId] ?? []).length;

        // Compute effective state for each seat considering pending changes
        const netAssigns = Object.values(pendingChanges).filter((a) => a === 'assign').length;
        const netRevokes = Object.values(pendingChanges).filter((a) => a === 'revoke').length;
        const projectedCount = currentlyAssigned + netAssigns - netRevokes;

        return (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 z-40" onClick={closePicker} />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm">{userName}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Requested: {requested} · Assigned: <span className={`font-medium ${
                        projectedCount === currentlyAssigned
                          ? projectedCount >= requested ? 'text-green-400' : 'text-gray-300'
                          : 'text-orange-400'
                      }`}>{projectedCount !== currentlyAssigned ? `${currentlyAssigned} → ${projectedCount}` : currentlyAssigned}</span>
                    </p>
                  </div>
                  <button onClick={closePicker} className="p-1 rounded hover:bg-gray-800 text-gray-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Seat list */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
                  {tickets.map((t) => {
                    const isThisUser = t.assigned_to === pickerUserId;
                    const isOtherUser = t.status === 'assigned' && !isThisUser;
                    const isAvailable = t.status === 'available';
                    const pending = pendingChanges[t.id];

                    // Effective checked state
                    let checked = isThisUser;
                    if (pending === 'assign') checked = true;
                    if (pending === 'revoke') checked = false;

                    const disabled = isOtherUser;

                    return (
                      <button
                        key={t.id}
                        disabled={disabled}
                        onClick={() => toggleSeat(t)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-800 cursor-pointer'
                        } ${pending ? 'bg-gray-800/50 ring-1 ring-orange-800/50' : ''}`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked
                            ? pending === 'revoke'
                              ? 'bg-red-600 border-red-500'
                              : pending === 'assign'
                                ? 'bg-orange-600 border-orange-500'
                                : 'bg-green-600 border-green-500'
                            : disabled
                              ? 'border-gray-700 bg-gray-800'
                              : 'border-gray-600'
                        }`}>
                          {checked && !pending && <Check className="w-3 h-3 text-white" />}
                          {pending === 'assign' && <Check className="w-3 h-3 text-white" />}
                          {pending === 'revoke' && <X className="w-3 h-3 text-white" />}
                          {disabled && <Lock className="w-2.5 h-2.5 text-gray-500" />}
                        </div>

                        {/* Seat info */}
                        <span className="font-mono text-sm flex-1">{seatLabel(t)}</span>

                        {/* Status label */}
                        {isThisUser && !pending && (
                          <span className="text-xs text-green-400">assigned</span>
                        )}
                        {pending === 'assign' && (
                          <span className="text-xs text-orange-400">+ assign</span>
                        )}
                        {pending === 'revoke' && (
                          <span className="text-xs text-red-400">− revoke</span>
                        )}
                        {isOtherUser && (
                          <span className="text-xs text-gray-500">{t.assigned_user_name}</span>
                        )}
                        {isAvailable && !pending && (
                          <span className="text-xs text-gray-600">available</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    {hasPendingChanges
                      ? `${Object.keys(pendingChanges).length} change${Object.keys(pendingChanges).length > 1 ? 's' : ''} pending`
                      : 'Click seats to assign or revoke'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={closePicker}
                      className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveChanges}
                      disabled={!hasPendingChanges || saving}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving…' : 'Apply Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
