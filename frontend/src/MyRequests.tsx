import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Ticket, Trash2, Edit3, Check, X, Gift, Plus, Minus, Send, Sun, Moon, Clock, AlertTriangle, Star, Ban } from 'lucide-react';
import type { TicketRequest, TicketSummary, Game, GameTicketDetail, Promotion } from './types';
import {
  fetchMyRequests,
  fetchMyGames,
  fetchGames,
  fetchTicketSummary,
  fetchPromotions,
  fetchMyGameTags,
  setGameTag,
  createRequests,
  withdrawRequest,
  updateRequest,
  releaseGameTickets,
} from './api';
import useAutoRefresh from './useAutoRefresh';

const GIANTS_TEAM_NAME = 'San Francisco Giants';

function formatDate(d: string) {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MyRequests() {
  const { isAuthenticated } = useAuth0();
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [gameMap, setGameMap] = useState<Record<number, Game>>({});
  const [ticketSummary, setTicketSummary] = useState<Record<number, TicketSummary>>({});
  const [myTicketsMap, setMyTicketsMap] = useState<Record<number, GameTicketDetail[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSeats, setEditSeats] = useState(1);
  const [promoMap, setPromoMap] = useState<Record<number, Promotion[]>>({});

  // Game tags (shortlist / can't go)
  const [tagsMap, setTagsMap] = useState<Record<number, { shortlist: boolean; cantGo: boolean }>>({});

  // Bulk request state
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [defaultSeats, setDefaultSeats] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [shortlistFilter, setShortlistFilter] = useState<'all' | 'shortlisted'>('all');
  const [dayNightFilter, setDayNightFilter] = useState<'all' | 'day' | 'night'>('all');
  const [dayTypeFilter, setDayTypeFilter] = useState<'all' | 'weekday' | 'weekend'>('all');
  const [releaseConfirm, setReleaseConfirm] = useState<{ gamePk: number; game?: Game; ticketCount: number } | null>(null);
  const [releasing, setReleasing] = useState(false);

  const load = useCallback((silent = false) => {
    if (!isAuthenticated) return;
    if (!silent) setLoading(true);
    Promise.all([fetchMyRequests(), fetchGames(), fetchTicketSummary(), fetchMyGames(), fetchMyGameTags()])
      .then(([reqs, gameList, summaryList, myGameTickets, gameTags]) => {
        setRequests(reqs);
        setAllGames(gameList);
        const gMap: Record<number, Game> = {};
        for (const g of gameList) gMap[g.game_pk] = g;
        setGameMap(gMap);
        const sMap: Record<number, TicketSummary> = {};
        for (const s of summaryList) sMap[s.game_pk] = s;
        setTicketSummary(sMap);
        const tMap: Record<number, GameTicketDetail[]> = {};
        for (const t of myGameTickets) {
          if (!tMap[t.game_pk]) tMap[t.game_pk] = [];
          tMap[t.game_pk].push(t);
        }
        setMyTicketsMap(tMap);
        const tagM: Record<number, { shortlist: boolean; cantGo: boolean }> = {};
        for (const t of gameTags) tagM[t.game_pk] = { shortlist: !!t.shortlist, cantGo: !!t.cant_go };
        setTagsMap(tagM);
        setSelections({});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  useEffect(() => load(), [load]);
  useAutoRefresh(() => load(true));

  // Load promos for all relevant games (requested + available)
  useEffect(() => {
    const requestedPks = requests.map((r) => r.game_pk);
    const availablePks = allGames
      .filter((g) => g.home_team_name === GIANTS_TEAM_NAME)
      .map((g) => g.game_pk);
    const gamePks = [...new Set([...requestedPks, ...availablePks])];
    if (gamePks.length === 0) return;
    let cancelled = false;
    Promise.all(
      gamePks.map(async (pk) => {
        try {
          const promos = await fetchPromotions(pk);
          return [pk, promos] as const;
        } catch {
          return [pk, []] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<number, Promotion[]> = {};
      for (const [pk, promos] of results) map[pk] = promos as Promotion[];
      setPromoMap(map);
    });
    return () => { cancelled = true; };
  }, [requests, allGames]);

  // Upcoming home games with no existing request
  const requestedPks = useMemo(() => new Set(requests.map((r) => r.game_pk)), [requests]);
  const availableGames = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allGames
      .filter(
        (g) =>
          g.home_team_name === GIANTS_TEAM_NAME &&
          g.official_date >= today &&
          g.status_detailed !== 'Final' &&
          !requestedPks.has(g.game_pk),
      )
      .sort((a, b) => a.official_date.localeCompare(b.official_date));
  }, [allGames, requestedPks]);

  const filteredGames = useMemo(() => {
    return availableGames.filter((g) => {
      if (shortlistFilter === 'shortlisted') {
        const tag = tagsMap[g.game_pk];
        if (!tag?.shortlist || tag?.cantGo) return false;
      }
      if (dayNightFilter !== 'all' && g.day_night !== dayNightFilter) return false;
      if (dayTypeFilter !== 'all') {
        const dow = new Date(g.official_date + 'T00:00:00').getDay();
        const isWeekend = dow === 0 || dow === 5 || dow === 6; // Fri, Sat, Sun
        if (dayTypeFilter === 'weekend' && !isWeekend) return false;
        if (dayTypeFilter === 'weekday' && isWeekend) return false;
      }
      return true;
    });
  }, [availableGames, shortlistFilter, tagsMap, dayNightFilter, dayTypeFilter]);

  const toggleTag = (gamePk: number, field: 'shortlist' | 'cantGo') => {
    setTagsMap((prev) => {
      const cur = prev[gamePk] ?? { shortlist: false, cantGo: false };
      const next = { ...cur, [field]: !cur[field] };
      // Optimistic update
      const updated = { ...prev, [gamePk]: next };
      if (!next.shortlist && !next.cantGo) delete updated[gamePk];
      // Fire API call in background
      setGameTag(gamePk, next.shortlist, next.cantGo).catch(() => {
        // Revert on failure
        setTagsMap((p) => ({ ...p, [gamePk]: cur }));
      });
      return updated;
    });
  };

  const handleRelease = async (gamePk: number) => {
    setReleasing(true);
    try {
      await releaseGameTickets(gamePk);
      setReleaseConfirm(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setReleaseConfirm(null);
    } finally {
      setReleasing(false);
    }
  };

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

  const toggleSelect = (gamePk: number) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (next[gamePk] !== undefined) {
        delete next[gamePk];
      } else {
        next[gamePk] = defaultSeats;
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredPks = new Set(filteredGames.map((g) => g.game_pk));
    const allFilteredSelected = filteredGames.length > 0 && filteredGames.every((g) => selections[g.game_pk] !== undefined);
    if (allFilteredSelected) {
      // Deselect only the filtered games
      setSelections((prev) => {
        const next = { ...prev };
        for (const pk of filteredPks) delete next[pk];
        return next;
      });
    } else {
      // Select all filtered games (keep existing selections for non-filtered)
      setSelections((prev) => {
        const next = { ...prev };
        for (const g of filteredGames) {
          if (next[g.game_pk] === undefined) next[g.game_pk] = defaultSeats;
        }
        return next;
      });
    }
  };


  const handleBulkSubmit = async () => {
    const items = Object.entries(selections).map(([pk, seats]) => ({
      game_pk: Number(pk),
      seats_requested: seats,
    }));
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      await createRequests(items);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
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

  const selectedCount = Object.keys(selections).length;
  const totalSelectedSeats = Object.values(selections).reduce((a, b) => a + b, 0);
  const allFilteredSelected = filteredGames.length > 0 && filteredGames.every((g) => selections[g.game_pk] !== undefined);

  // My Requests summary stats
  const gamesAllocated = requests.filter((r) => (myTicketsMap[r.game_pk]?.length ?? 0) > 0).length;
  const gamesPending = requests.filter((r) => r.status === 'pending' && !(myTicketsMap[r.game_pk]?.length)).length;
  const gamesRequested = requests.length;
  const seatsAllocated = requests.reduce((sum, r) => sum + (myTicketsMap[r.game_pk]?.length ?? 0), 0);
  const seatsPending = requests.filter((r) => r.status === 'pending' && !(myTicketsMap[r.game_pk]?.length)).reduce((sum, r) => sum + r.seats_requested, 0);
  const seatsRequested = requests.reduce((sum, r) => sum + r.seats_requested, 0);

  return (
    <div className="space-y-10">
      {/* ===== Section 1: My Current Requests ===== */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Ticket className="w-5 h-5 text-orange-500" />
          <h2 className="text-xl font-bold">My Requests</h2>
        </div>
        {requests.length > 0 && (
          <div className="mb-4 text-xs text-gray-400 space-y-0.5">
            <div className="flex gap-4">
              <span>Games: <span className="text-green-400 font-medium">{gamesAllocated} allocated</span></span>
              <span><span className="text-yellow-400 font-medium">{gamesPending} pending</span></span>
              <span><span className="text-gray-300 font-medium">{gamesRequested} total</span></span>
            </div>
            <div className="flex gap-4">
              <span>Seats: <span className="text-green-400 font-medium">{seatsAllocated} allocated</span></span>
              <span><span className="text-yellow-400 font-medium">{seatsPending} pending</span></span>
              <span><span className="text-gray-300 font-medium">{seatsRequested} total</span></span>
            </div>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No requests yet. Use the table below to request tickets for upcoming games.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Opponent</th>
                  <th className="py-2 px-3">Promos</th>
                  <th className="py-2 px-3 text-center">Seats</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3">Notes</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const game = gameMap[r.game_pk];
                  return (
                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-2 px-3 whitespace-nowrap">{game ? formatDate(game.official_date) : r.game_pk}</td>
                      <td className="py-2 px-3">{game?.away_team_name ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-300 max-w-[250px]">
                        {(() => {
                          const promos = promoMap[r.game_pk];
                          const names = promos?.map((p) => p.name).join(', ');
                          return names ? (
                            <span className="flex items-center gap-1">
                              <Gift className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              <span className="truncate text-xs">{names}</span>
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          );
                        })()}
                      </td>
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
                      <td className="py-2 px-3 text-center">
                        {(() => {
                          const tickets = myTicketsMap[r.game_pk];
                          if (tickets && tickets.length > 0) {
                            const partial = tickets.length < r.seats_requested;
                            return (
                              <span className={`inline-flex items-center gap-1 font-medium text-xs ${partial ? 'text-yellow-400' : 'text-green-400'}`}>
                                <Check className="w-3.5 h-3.5" />
                                {partial ? `${tickets.length}/${r.seats_requested}` : tickets.length}
                              </span>
                            );
                          }
                          if (r.status === 'approved') {
                            return (
                              <span className="inline-flex items-center gap-1 text-emerald-300 text-xs font-medium">
                                <Check className="w-3 h-3" />
                                {r.seats_approved || r.seats_requested}
                              </span>
                            );
                          }
                          if (r.status === 'pending') {
                            return (
                              <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
                                <Clock className="w-3 h-3" />
                                {r.seats_requested}
                              </span>
                            );
                          }
                          if (r.status === 'declined') {
                            return <span className="text-red-400 text-xs">declined</span>;
                          }
                          if (r.status === 'withdrawn') {
                            return <span className="text-gray-500 text-xs">withdrawn</span>;
                          }
                          return <span className="text-gray-600">—</span>;
                        })()}
                      </td>
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
                        {(myTicketsMap[r.game_pk]?.length ?? 0) > 0 && (
                          <button
                            onClick={() => setReleaseConfirm({ gamePk: r.game_pk, game, ticketCount: myTicketsMap[r.game_pk].length })}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-red-400 hover:bg-red-900/20 transition-colors"
                            title="Release tickets"
                          >
                            <Trash2 className="w-3 h-3" />
                            Release
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
      </div>

      {/* ===== Section 2: Bulk Request ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" />
              <h2 className="text-xl font-bold">Request Tickets</h2>
              <span className="text-sm text-gray-500">({filteredGames.length} of {availableGames.length} games)</span>
            </div>
            {selectedCount > 0 && (
              <div className="mt-1 text-xs text-gray-400">
                Selected: <span className="text-orange-400 font-medium">{selectedCount} game{selectedCount > 1 ? 's' : ''}</span>,{' '}
                <span className="text-orange-400 font-medium">{totalSelectedSeats} seat{totalSelectedSeats > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Default seats:</span>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800 border border-gray-700">
              <button
                onClick={() => setDefaultSeats(Math.max(1, defaultSeats - 1))}
                className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-bold text-orange-400 w-4 text-center">{defaultSeats}</span>
              <button
                onClick={() => setDefaultSeats(Math.min(4, defaultSeats + 1))}
                className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-1">
            {(['all', 'shortlisted'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setShortlistFilter(v)}
                className={`px-2 py-0.5 rounded text-[0.65rem] font-medium transition-colors ${
                  shortlistFilter === v
                    ? 'bg-orange-600/20 text-orange-400 border border-orange-800/50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                }`}
              >
                {v === 'all' ? 'All' : '★ Shortlisted'}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-1">
            {(['all', 'day', 'night'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDayNightFilter(v)}
                className={`px-2 py-0.5 rounded text-[0.65rem] font-medium transition-colors ${
                  dayNightFilter === v
                    ? 'bg-orange-600/20 text-orange-400 border border-orange-800/50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                }`}
              >
                {v === 'all' ? 'All' : v === 'day' ? '☀ Day' : '☽ Night'}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-1">
            {(['all', 'weekday', 'weekend'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDayTypeFilter(v)}
                className={`px-2 py-0.5 rounded text-[0.65rem] font-medium transition-colors ${
                  dayTypeFilter === v
                    ? 'bg-orange-600/20 text-orange-400 border border-orange-800/50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                }`}
              >
                {v === 'all' ? 'All' : v === 'weekday' ? 'Weekday' : 'Weekend'}
              </button>
            ))}
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{availableGames.length === 0 ? 'No upcoming home games available to request.' : 'No games match the current filters.'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-left">
                    <th className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Opponent</th>
                    <th className="py-2 px-3 text-center">D/N</th>
                    <th className="py-2 px-3 text-center">Available</th>
                    <th className="py-2 px-3">Promos</th>
                    <th className="py-2 px-1 text-center w-8" title="Shortlist"><Star className="w-3.5 h-3.5 inline text-gray-500" /></th>
                    <th className="py-2 px-1 text-center w-8" title="Can't Go"><Ban className="w-3.5 h-3.5 inline text-gray-500" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((g) => {
                    const isSelected = selections[g.game_pk] !== undefined;
                    const summary = ticketSummary[g.game_pk];
                    const tag = tagsMap[g.game_pk];
                    const isShortlisted = !!tag?.shortlist;
                    const isCantGo = !!tag?.cantGo;
                    return (
                      <tr
                        key={g.game_pk}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                          isCantGo ? 'opacity-40' :
                          isSelected ? 'bg-orange-900/10' :
                          isShortlisted ? 'border-l-2 border-l-orange-500' :
                          'hover:bg-gray-900/50'
                        }`}
                        onClick={() => toggleSelect(g.game_pk)}
                      >
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(g.game_pk)}
                            className="rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap font-medium">{formatDate(g.official_date)}</td>
                        <td className={`py-2 px-3${isCantGo ? ' line-through' : ''}`}>{g.away_team_name}</td>
                        <td className="py-2 px-3 text-center">
                          {g.day_night === 'night' ? (
                            <Moon className="w-3.5 h-3.5 text-indigo-400 inline" />
                          ) : g.day_night === 'day' ? (
                            <Sun className="w-3.5 h-3.5 text-yellow-400 inline" />
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {summary ? (
                            <span className={summary.available > 0 ? 'text-green-400 font-medium' : 'text-gray-500'}>
                              {summary.available}/{summary.total}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-300 max-w-[250px]">
                          {(() => {
                            const promos = promoMap[g.game_pk];
                            const names = promos?.map((p) => p.name).join(', ');
                            return names ? (
                              <span className="flex items-center gap-1">
                                <Gift className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                                <span className="truncate text-xs">{names}</span>
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            );
                          })()}
                        </td>
                        <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleTag(g.game_pk, 'shortlist')}
                            className={`p-1 rounded transition-colors ${
                              isShortlisted
                                ? 'text-orange-400 hover:text-orange-300'
                                : 'text-gray-700 hover:text-gray-400'
                            }`}
                            title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                          >
                            <Star className={`w-4 h-4${isShortlisted ? ' fill-current' : ''}`} />
                          </button>
                        </td>
                        <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleTag(g.game_pk, 'cantGo')}
                            className={`p-1 rounded transition-colors ${
                              isCantGo
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-gray-700 hover:text-gray-400'
                            }`}
                            title={isCantGo ? "Remove can't go" : "Mark as can't go"}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedCount > 0 && (
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={handleBulkSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting…' : `Request ${selectedCount} game${selectedCount > 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => setSelections({})}
                  className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {/* Release confirmation dialog */}
      {releaseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-900/30">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Release Tickets?</h3>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              You are about to release <span className="font-bold text-red-400">{releaseConfirm.ticketCount} ticket{releaseConfirm.ticketCount > 1 ? 's' : ''}</span> for:
            </p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4">
              <div className="text-sm font-medium text-white">
                {releaseConfirm.game ? formatDate(releaseConfirm.game.official_date) : ''}
              </div>
              <div className="text-sm text-gray-400">
                vs {releaseConfirm.game?.away_team_name ?? 'Unknown'}
              </div>
            </div>
            <p className="text-xs text-yellow-400 mb-5">
              This action cannot be undone. The tickets will be returned to the available pool and may be assigned to someone else.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setReleaseConfirm(null)}
                disabled={releasing}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRelease(releaseConfirm.gamePk)}
                disabled={releasing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {releasing ? 'Releasing…' : 'Release Tickets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
