import { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BarChart3, Ticket, Check, X, Lock, ChevronDown, ChevronRight, User, CalendarDays } from 'lucide-react';
import type { UserAllocationSection, UserAllocationEntry, UserTicketInfo, GameAllocationDetail, GameTicketWithUser } from './types';
import { fetchAllocationByUsers, fetchGameAllocation, allocateTickets, revokeTicket, fetchMe } from './api';

function seatLabel(t: { section: string; row: string; seat: string }) {
  return `${t.section}:${t.row}${t.seat}`;
}

function frac(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

type GameSortKey = 'date' | 'opponent' | 'user' | 'available' | 'allocated';
type EntrySortKey = 'date' | 'opponent' | 'available' | 'allocated';

export default function AllocationDashboard() {
  const { isAuthenticated } = useAuth0();
  const [sections, setSections] = useState<UserAllocationSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // View mode toggle
  const [viewMode, setViewMode] = useState<'byUser' | 'byGame'>('byUser');

  // Sort state for All Games view
  const [gameSortKey, setGameSortKey] = useState<GameSortKey>('date');
  const [gameSortAsc, setGameSortAsc] = useState(true);

  // Sort state for By User view (shared across all user tables)
  const [entrySortKey, setEntrySortKey] = useState<EntrySortKey>('date');
  const [entrySortAsc, setEntrySortAsc] = useState(true);

  // Collapsed/expanded user sections
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  // Seat picker modal state
  const [pickerUserId, setPickerUserId] = useState<number | null>(null);
  const [pickerUserName, setPickerUserName] = useState('');
  const [pickerRequestId, setPickerRequestId] = useState<number | null>(null);
  const [pickerEntry, setPickerEntry] = useState<UserAllocationEntry | null>(null);
  const [modalData, setModalData] = useState<GameAllocationDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<number, 'assign' | 'revoke'>>({});
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    if (!isAuthenticated) return;
    setLoading(true);
    fetchMe()
      .then((me) => {
        setIsAdmin(me.role === 'admin');
        if (me.role !== 'admin') {
          setLoading(false);
          return;
        }
        return fetchAllocationByUsers()
          .then((data) => {
            setSections(data);
            // Auto-expand all users on first load
            setExpandedUsers(new Set(data.map((s) => s.user_id)));
          })
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  };

  useEffect(loadData, [isAuthenticated]);

  const toggleUser = (userId: number) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Seat picker ──

  const openPicker = (userId: number, userName: string, entry: UserAllocationEntry) => {
    setPickerUserId(userId);
    setPickerUserName(userName);
    setPickerRequestId(entry.request_id);
    setPickerEntry(entry);
    setModalData(null);
    setModalLoading(true);
    setPendingChanges({});
    fetchGameAllocation(entry.game_pk)
      .then(setModalData)
      .catch((err) => setError(err.message))
      .finally(() => setModalLoading(false));
  };

  const closePicker = () => {
    setPickerUserId(null);
    setPickerRequestId(null);
    setPickerEntry(null);
    setModalData(null);
    setPendingChanges({});
  };

  const toggleSeat = (ticket: GameTicketWithUser) => {
    if (pickerUserId == null) return;
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (ticket.status === 'available') {
        if (next[ticket.id] === 'assign') delete next[ticket.id];
        else next[ticket.id] = 'assign';
      } else if (ticket.status === 'assigned' && ticket.assigned_to === pickerUserId) {
        if (next[ticket.id] === 'revoke') delete next[ticket.id];
        else next[ticket.id] = 'revoke';
      }
      return next;
    });
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const handleSaveChanges = async () => {
    if (!pickerUserId || !hasPendingChanges) return;
    setSaving(true);
    try {
      for (const [ticketIdStr, action] of Object.entries(pendingChanges)) {
        if (action === 'revoke') await revokeTicket(Number(ticketIdStr));
      }
      const assigns = Object.entries(pendingChanges)
        .filter(([, action]) => action === 'assign')
        .map(([ticketIdStr]) => ({
          game_ticket_id: Number(ticketIdStr),
          user_id: pickerUserId,
          request_id: pickerRequestId ?? undefined,
        }));
      if (assigns.length > 0) await allocateTickets(assigns);
      closePicker();
      // Refresh all data
      fetchAllocationByUsers().then(setSections).catch(() => {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Derived picker data
  const modalTickets = modalData?.tickets ?? [];
  const pickerUserTickets = modalTickets.filter((t) => t.assigned_to === pickerUserId);

  // Derive flat game rows for "All Games" view
  type GameRow = {
    game_pk: number;
    official_date: string;
    away_team_name: string;
    day_night: string | null;
    game_total_seats: number;
    game_available: number;
    user_id: number;
    user_name: string;
    request_id: number;
    seats_requested: number;
    user_tickets: UserTicketInfo[];
  };

  const gameRows = useMemo(() => {
    const rows: GameRow[] = [];
    for (const section of sections) {
      for (const entry of section.entries) {
        rows.push({
          game_pk: entry.game_pk,
          official_date: entry.official_date,
          away_team_name: entry.away_team_name,
          day_night: entry.day_night,
          game_total_seats: entry.game_total_seats,
          game_available: entry.game_available,
          user_id: section.user_id,
          user_name: section.user_name,
          request_id: entry.request_id,
          seats_requested: entry.seats_requested,
          user_tickets: entry.user_tickets,
        });
      }
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (gameSortKey) {
        case 'date': cmp = a.official_date.localeCompare(b.official_date); break;
        case 'opponent': cmp = a.away_team_name.localeCompare(b.away_team_name); break;
        case 'user': cmp = a.user_name.localeCompare(b.user_name); break;
        case 'available': cmp = frac(a.game_available, a.game_total_seats) - frac(b.game_available, b.game_total_seats); break;
        case 'allocated': cmp = frac(a.user_tickets.length, a.seats_requested) - frac(b.user_tickets.length, b.seats_requested); break;
      }
      if (cmp === 0 && gameSortKey !== 'date') cmp = a.official_date.localeCompare(b.official_date);
      if (cmp === 0 && gameSortKey !== 'user') cmp = a.user_name.localeCompare(b.user_name);
      return gameSortAsc ? cmp : -cmp;
    });
    return rows;
  }, [sections, gameSortKey, gameSortAsc]);

  // Helper: find the UserAllocationEntry for a game row so the picker can use it
  const entryForGameRow = (row: GameRow): UserAllocationEntry | undefined => {
    const section = sections.find((s) => s.user_id === row.user_id);
    return section?.entries.find((e) => e.request_id === row.request_id);
  };

  // Sort helpers
  const toggleGameSort = (key: GameSortKey) => {
    if (gameSortKey === key) setGameSortAsc(!gameSortAsc);
    else { setGameSortKey(key); setGameSortAsc(true); }
  };
  const toggleEntrySort = (key: EntrySortKey) => {
    if (entrySortKey === key) setEntrySortAsc(!entrySortAsc);
    else { setEntrySortKey(key); setEntrySortAsc(true); }
  };
  const gameSortIndicator = (key: GameSortKey) => gameSortKey === key ? (gameSortAsc ? ' ↑' : ' ↓') : '';
  const entrySortIndicator = (key: EntrySortKey) => entrySortKey === key ? (entrySortAsc ? ' ↑' : ' ↓') : '';

  // Sort entries within a user section
  const sortedEntries = (entries: UserAllocationEntry[]): UserAllocationEntry[] => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      switch (entrySortKey) {
        case 'date': cmp = a.official_date.localeCompare(b.official_date); break;
        case 'opponent': cmp = a.away_team_name.localeCompare(b.away_team_name); break;
        case 'available': cmp = frac(a.game_available, a.game_total_seats) - frac(b.game_available, b.game_total_seats); break;
        case 'allocated': cmp = frac(a.user_tickets.length, a.seats_requested) - frac(b.user_tickets.length, b.seats_requested); break;
      }
      if (cmp === 0 && entrySortKey !== 'date') cmp = a.official_date.localeCompare(b.official_date);
      return entrySortAsc ? cmp : -cmp;
    });
  };

  // ── Render ──

  if (!isAuthenticated) {
    return <div className="text-center py-20 text-gray-500">Please log in.</div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-gray-500 text-lg">Loading allocation data…</div></div>;
  }
  if (error) {
    return <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-400">Error: {error}</div>;
  }
  if (!isAdmin) {
    return <div className="text-center py-20 text-gray-500">Admin access required.</div>;
  }

  // Global totals
  const totalUsers = sections.length;
  const totalAllocated = sections.reduce((s, u) => s + u.total_allocated, 0);
  const totalRequested = sections.reduce((s, u) => s + u.total_requested, 0);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-orange-500" />
          <h2 className="text-xl font-bold">Allocation</h2>
          <div className="flex items-center rounded-lg border border-gray-700 overflow-hidden ml-2">
            <button
              onClick={() => setViewMode('byUser')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'byUser'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <User className="w-3.5 h-3.5" /> By User
            </button>
            <button
              onClick={() => setViewMode('byGame')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'byGame'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> All Games
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Total Allocated: <span className="text-green-400 font-medium">{totalAllocated}</span></span>
          <span>Total Requested: <span className="text-gray-300 font-medium">{totalRequested}</span></span>
          <span className="text-gray-600">({totalUsers} users)</span>
        </div>
      </div>

      {sections.length === 0 && (
        <div className="text-center py-16 text-gray-500">No active requests found.</div>
      )}

      {/* ===== All Games View ===== */}
      {viewMode === 'byGame' && sections.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left text-xs">
                <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleGameSort('date')}>Date{gameSortIndicator('date')}</th>
                <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleGameSort('opponent')}>Opponent{gameSortIndicator('opponent')}</th>
                <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleGameSort('user')}>User{gameSortIndicator('user')}</th>
                <th className="py-2 px-3 text-center cursor-pointer select-none" onClick={() => toggleGameSort('available')}>Available{gameSortIndicator('available')}</th>
                <th className="py-2 px-3 text-center cursor-pointer select-none" onClick={() => toggleGameSort('allocated')}>Allocated{gameSortIndicator('allocated')}</th>
                <th className="py-2 px-3">Seats</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {gameRows.map((row, idx) => {
                const allocated = row.user_tickets.length;
                const fulfilled = allocated >= row.seats_requested;
                const prevRow = idx > 0 ? gameRows[idx - 1] : null;
                const isNewGame = !prevRow || prevRow.game_pk !== row.game_pk;

                return (
                  <tr
                    key={`${row.game_pk}-${row.user_id}`}
                    className={`border-b border-gray-800/40 hover:bg-gray-800/20 ${gameSortKey === 'date' && isNewGame && idx > 0 ? 'border-t border-gray-700' : ''}`}
                  >
                    <td className="py-1.5 px-3 text-sm">{row.official_date}</td>
                    <td className="py-1.5 px-3 text-sm">
                      {row.away_team_name}
                      {row.day_night && (
                        <span className="ml-1.5 text-[10px] text-gray-500 uppercase">{row.day_night === 'night' ? 'N' : 'D'}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-sm font-medium">{row.user_name}</td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={`text-xs ${row.game_available > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                        {row.game_available}/{row.game_total_seats}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={`text-xs font-medium ${
                        allocated === 0 ? 'text-gray-500' : fulfilled ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {allocated}/{row.seats_requested}
                      </span>
                    </td>
                    <td className="py-1.5 px-3">
                      {row.user_tickets.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.user_tickets.map((t) => (
                            <span key={t.ticket_id} className="font-mono text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/50">
                              {seatLabel(t)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      <button
                        onClick={() => {
                          const entry = entryForGameRow(row);
                          if (entry) openPicker(row.user_id, row.user_name, entry);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-orange-400 hover:bg-orange-900/20 transition-colors"
                      >
                        <Ticket className="w-3 h-3" /> Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== By User View ===== */}
      {viewMode === 'byUser' && <div className="space-y-4">
        {sections.map((section) => {
          const expanded = expandedUsers.has(section.user_id);
          const allFulfilled = section.total_allocated >= section.total_requested;

          return (
            <div key={section.user_id} className="border border-gray-800 rounded-lg overflow-hidden">
              {/* User header */}
              <button
                onClick={() => toggleUser(section.user_id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900/50 hover:bg-gray-900 transition-colors text-left"
              >
                {expanded
                  ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                <User className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span className="font-semibold text-sm flex-1">{section.user_name}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-gray-400">
                    Seats: <span className={`font-medium ${
                      allFulfilled ? 'text-green-400' : section.total_allocated > 0 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>{section.total_allocated}/{section.total_requested}</span>
                  </span>
                  <span className="text-gray-400">
                    Games: <span className="text-gray-300 font-medium">{section.games_allocated}/{section.games_requested}</span>
                  </span>
                </div>
              </button>

              {/* Game table (collapsible) */}
              {expanded && (
                <div className="px-4 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500 text-left text-xs">
                        <th className="py-1.5 px-2 cursor-pointer select-none" onClick={() => toggleEntrySort('date')}>Date{entrySortIndicator('date')}</th>
                        <th className="py-1.5 px-2 cursor-pointer select-none" onClick={() => toggleEntrySort('opponent')}>Opponent{entrySortIndicator('opponent')}</th>
                        <th className="py-1.5 px-2 text-center cursor-pointer select-none" onClick={() => toggleEntrySort('available')}>Available{entrySortIndicator('available')}</th>
                        <th className="py-1.5 px-2 text-center cursor-pointer select-none" onClick={() => toggleEntrySort('allocated')}>Allocated{entrySortIndicator('allocated')}</th>
                        <th className="py-1.5 px-2">Seats</th>
                        <th className="py-1.5 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntries(section.entries).map((entry) => {
                        const allocated = entry.user_tickets.length;
                        const fulfilled = allocated >= entry.seats_requested;

                        return (
                          <tr key={entry.request_id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                            <td className="py-1.5 px-2 text-sm">{entry.official_date}</td>
                            <td className="py-1.5 px-2 text-sm">
                              {entry.away_team_name}
                              {entry.day_night && (
                                <span className="ml-1.5 text-[10px] text-gray-500 uppercase">{entry.day_night === 'night' ? 'N' : 'D'}</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span className={`text-xs ${entry.game_available > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                                {entry.game_available}/{entry.game_total_seats}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span className={`text-xs font-medium ${
                                allocated === 0 ? 'text-gray-500' : fulfilled ? 'text-green-400' : 'text-yellow-400'
                              }`}>
                                {allocated}/{entry.seats_requested}
                              </span>
                            </td>
                            <td className="py-1.5 px-2">
                              {entry.user_tickets.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {entry.user_tickets.map((t) => (
                                    <span key={t.ticket_id} className="font-mono text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/50">
                                      {seatLabel(t)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2">
                              <button
                                onClick={() => openPicker(section.user_id, section.user_name, entry)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-orange-400 hover:bg-orange-900/20 transition-colors"
                              >
                                <Ticket className="w-3 h-3" /> Manage
                              </button>
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
        })}
      </div>}

      {/* ===== Seat Picker Modal ===== */}
      {pickerUserId != null && pickerEntry && (() => {
        const requested = pickerEntry.seats_requested;
        const currentlyAssigned = pickerUserTickets.length;
        const netAssigns = Object.values(pendingChanges).filter((a) => a === 'assign').length;
        const netRevokes = Object.values(pendingChanges).filter((a) => a === 'revoke').length;
        const projectedCount = currentlyAssigned + netAssigns - netRevokes;

        return (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={closePicker} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm">{pickerUserName}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {pickerEntry.official_date} vs <span className="text-orange-400">{pickerEntry.away_team_name}</span>
                      </p>
                    </div>
                    <button onClick={closePicker} className="p-1 rounded hover:bg-gray-800 text-gray-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Requested: {requested} · Assigned: <span className={`font-medium ${
                      projectedCount === currentlyAssigned
                        ? projectedCount >= requested ? 'text-green-400' : 'text-gray-300'
                        : 'text-orange-400'
                    }`}>{projectedCount !== currentlyAssigned ? `${currentlyAssigned} → ${projectedCount}` : currentlyAssigned}</span>
                  </div>
                </div>

                {/* Seat list */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
                  {modalLoading ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Loading seats…</div>
                  ) : modalTickets.map((t) => {
                    const isThisUser = t.assigned_to === pickerUserId;
                    const isOtherUser = t.status === 'assigned' && !isThisUser;
                    const isAvailable = t.status === 'available';
                    const pending = pendingChanges[t.id];

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
                          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 cursor-pointer'
                        } ${pending ? 'bg-gray-800/50 ring-1 ring-orange-800/50' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked
                            ? pending === 'revoke' ? 'bg-red-600 border-red-500'
                              : pending === 'assign' ? 'bg-orange-600 border-orange-500'
                                : 'bg-green-600 border-green-500'
                            : disabled ? 'border-gray-700 bg-gray-800' : 'border-gray-600'
                        }`}>
                          {checked && !pending && <Check className="w-3 h-3 text-white" />}
                          {pending === 'assign' && <Check className="w-3 h-3 text-white" />}
                          {pending === 'revoke' && <X className="w-3 h-3 text-white" />}
                          {disabled && <Lock className="w-2.5 h-2.5 text-gray-500" />}
                        </div>
                        <span className="font-mono text-sm flex-1">{seatLabel(t)}</span>
                        {isThisUser && !pending && <span className="text-xs text-green-400">assigned</span>}
                        {pending === 'assign' && <span className="text-xs text-orange-400">+ assign</span>}
                        {pending === 'revoke' && <span className="text-xs text-red-400">− revoke</span>}
                        {isOtherUser && <span className="text-xs text-gray-500">{t.assigned_user_name}</span>}
                        {isAvailable && !pending && <span className="text-xs text-gray-600">available</span>}
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
                    <button onClick={closePicker} className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800">
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
