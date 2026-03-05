import { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Home,
  Plane,
  Gift,
  Ticket,
  Tag,
  X,
  Plus,
  Minus,
  Send,
  Check,
  CalendarCheck,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { Game, Promotion, TicketSummary, TicketRequest, GameTicketDetail, GameTicketWithUser } from './types';
import { fetchPromotions, fetchGameAllocation, createRequests } from './api';

const GIANTS_TEAM_NAME = 'San Francisco Giants';

const MONTHS = [
  'All',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
];
const MONTH_NUMBERS: Record<string, number | null> = {
  All: null,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
};

type SortKey = 'official_date' | 'opponent' | 'venue_name' | 'status_detailed';
type SortDir = 'asc' | 'desc';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(game: Game): string {
  if (game.start_time_tbd) return 'TBD';
  const d = new Date(game.game_date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function statusColor(status: string): string {
  switch (status) {
    case 'Final':
      return 'text-gray-400';
    case 'Scheduled':
      return 'text-green-400';
    case 'In Progress':
      return 'text-yellow-400';
    case 'Postponed':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

function scoreDisplay(game: Game): string {
  if (game.away_score === null && game.home_score === null) return '—';
  return `${game.away_score ?? 0} - ${game.home_score ?? 0}`;
}

interface Props {
  games: Game[];
  seasons: string[];
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
  ticketSummary: Record<number, TicketSummary>;
  userRole: string | null;
  isAuthenticated: boolean;
  myRequests: TicketRequest[];
  myGames: GameTicketDetail[];
  onDataRefresh: () => void;
  onScrape?: () => void;
  scraping?: boolean;
  scrapeResult?: string | null;
}

export default function ScheduleTable({
  games,
  seasons,
  selectedSeason,
  onSeasonChange,
  ticketSummary,
  userRole,
  isAuthenticated,
  myRequests,
  myGames,
  onDataRefresh,
  onScrape,
  scraping,
  scrapeResult,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('official_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [promoMap, setPromoMap] = useState<Record<number, Promotion[]>>({});
  const [loadingPromos, setLoadingPromos] = useState<number | null>(null);
  const [homeOnly, setHomeOnly] = useState(false);
  const [myGamesOnly, setMyGamesOnly] = useState(false);

  const myGamePks = useMemo(
    () => new Set(myGames.map((t) => t.game_pk)),
    [myGames],
  );

  const myRequestMap = useMemo(() => {
    const map: Record<number, TicketRequest> = {};
    for (const r of myRequests) map[r.game_pk] = r;
    return map;
  }, [myRequests]);

  const myGamesMap = useMemo(() => {
    const map: Record<number, GameTicketDetail[]> = {};
    for (const t of myGames) {
      if (!map[t.game_pk]) map[t.game_pk] = [];
      map[t.game_pk].push(t);
    }
    return map;
  }, [myGames]);

  // Preload all promo names for the current season's games
  useEffect(() => {
    let cancelled = false;
    async function loadAllPromos() {
      const map: Record<number, Promotion[]> = {};
      await Promise.all(
        games.map(async (g) => {
          try {
            const promos = await fetchPromotions(g.game_pk);
            if (!cancelled) map[g.game_pk] = promos;
          } catch {
            if (!cancelled) map[g.game_pk] = [];
          }
        }),
      );
      if (!cancelled) setPromoMap(map);
    }
    loadAllPromos();
    return () => { cancelled = true; };
  }, [games]);

  const monthNum = MONTH_NUMBERS[selectedMonth];
  const filtered = games.filter((g) => {
    const monthMatch =
      monthNum === null ||
      parseInt(g.official_date.split('-')[1], 10) === monthNum;
    const homeMatch = !homeOnly || g.home_team_name === GIANTS_TEAM_NAME;
    const myGamesMatch = !myGamesOnly || myGamePks.has(g.game_pk);
    return monthMatch && homeMatch && myGamesMatch;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'official_date':
        cmp = a.official_date.localeCompare(b.official_date);
        break;
      case 'opponent': {
        const oppA =
          a.home_team_name === GIANTS_TEAM_NAME
            ? a.away_team_name
            : a.home_team_name;
        const oppB =
          b.home_team_name === GIANTS_TEAM_NAME
            ? b.away_team_name
            : b.home_team_name;
        cmp = oppA.localeCompare(oppB);
        break;
      }
      case 'venue_name':
        cmp = a.venue_name.localeCompare(b.venue_name);
        break;
      case 'status_detailed':
        cmp = a.status_detailed.localeCompare(b.status_detailed);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function toggleExpand(gamePk: number) {
    if (expandedGame === gamePk) {
      setExpandedGame(null);
      return;
    }
    setExpandedGame(gamePk);
    if (!promoMap[gamePk]) {
      setLoadingPromos(gamePk);
      try {
        const promos = await fetchPromotions(gamePk);
        setPromoMap((prev) => ({ ...prev, [gamePk]: promos }));
      } catch {
        setPromoMap((prev) => ({ ...prev, [gamePk]: [] }));
      }
      setLoadingPromos(null);
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ChevronDown className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 inline ml-1 text-orange-400" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1 text-orange-400" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Season selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const idx = seasons.indexOf(selectedSeason);
              if (idx > 0) onSeasonChange(seasons[idx - 1]);
            }}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
            disabled={seasons.indexOf(selectedSeason) === 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-lg font-bold text-orange-400 min-w-[3rem] text-center">
            {selectedSeason}
          </span>
          <button
            onClick={() => {
              const idx = seasons.indexOf(selectedSeason);
              if (idx < seasons.length - 1) onSeasonChange(seasons[idx + 1]);
            }}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
            disabled={
              seasons.indexOf(selectedSeason) === seasons.length - 1
            }
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-gray-700" />

        {/* Month pills */}
        <div className="flex gap-1">
          {MONTHS.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedMonth === m
                  ? 'bg-orange-500 text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-700" />

        {/* Home only toggle */}
        <button
          onClick={() => setHomeOnly(!homeOnly)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            homeOnly
              ? 'bg-orange-500 text-black'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          Home Only
        </button>

        {/* My Games toggle */}
        {myGames.length > 0 && (
          <button
            onClick={() => setMyGamesOnly(!myGamesOnly)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              myGamesOnly
                ? 'bg-orange-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            My Games
          </button>
        )}

        {/* Scrape Schedule (admin only) */}
        {userRole === 'admin' && onScrape && (
          <>
            <div className="h-6 w-px bg-gray-700" />
            <button
              onClick={onScrape}
              disabled={scraping}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scraping ? 'animate-spin' : ''}`} />
              {scraping ? 'Scraping…' : 'Scrape'}
            </button>
            {scrapeResult && (
              <span className={`text-xs ${scrapeResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {scrapeResult}
              </span>
            )}
          </>
        )}

        <div className="ml-auto text-sm text-gray-500">
          {sorted.length} game{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-left">
              <th className="w-10 px-3 py-2" />
              <th
                className="px-3 py-2 cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('official_date')}
              >
                Date
                <SortIcon col="official_date" />
              </th>
              <th className="px-3 py-2 whitespace-nowrap">Time</th>
              <th className="px-3 py-2 whitespace-nowrap">H/A</th>
              <th
                className="px-3 py-2 cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('opponent')}
              >
                Opponent
                <SortIcon col="opponent" />
              </th>
              <th className="px-3 py-2 whitespace-nowrap">Score</th>
              <th
                className="px-3 py-2 cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('status_detailed')}
              >
                Status
                <SortIcon col="status_detailed" />
              </th>
              <th
                className="px-3 py-2 cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('venue_name')}
              >
                Venue
                <SortIcon col="venue_name" />
              </th>
              <th className="px-3 py-2 whitespace-nowrap">D/N</th>
              {isAuthenticated && (
                <>
                  <th className="px-3 py-2 whitespace-nowrap">Tickets</th>
                  <th className="px-3 py-2 whitespace-nowrap">Request</th>
                </>
              )}
              <th className="px-3 py-2 whitespace-nowrap">Promos</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const isHome = g.home_team_name === GIANTS_TEAM_NAME;
              const opponent = isHome ? g.away_team_name : g.home_team_name;
              const isExpanded = expandedGame === g.game_pk;
              const gamePromos = promoMap[g.game_pk] ?? [];

              return (
                <ScheduleRow
                  key={g.game_pk}
                  game={g}
                  isHome={isHome}
                  opponent={opponent}
                  isExpanded={isExpanded}
                  gamePromos={gamePromos}
                  loadingPromos={loadingPromos === g.game_pk}
                  onToggle={() => toggleExpand(g.game_pk)}
                  ticketSummary={isHome ? ticketSummary[g.game_pk] : undefined}
                  userRole={userRole}
                  isAuthenticated={isAuthenticated}
                  myRequest={myRequestMap[g.game_pk]}
                  myTickets={myGamesMap[g.game_pk]}
                  onDataRefresh={onDataRefresh}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleRow({
  game,
  isHome,
  opponent,
  isExpanded,
  gamePromos,
  loadingPromos,
  onToggle,
  ticketSummary,
  userRole,
  isAuthenticated,
  myRequest,
  myTickets,
  onDataRefresh,
}: {
  game: Game;
  isHome: boolean;
  opponent: string;
  isExpanded: boolean;
  gamePromos: Promotion[];
  loadingPromos: boolean;
  onToggle: () => void;
  ticketSummary?: TicketSummary;
  userRole: string | null;
  isAuthenticated: boolean;
  myRequest?: TicketRequest;
  myTickets?: GameTicketDetail[];
  onDataRefresh: () => void;
}) {
  const promoNames = gamePromos.map((p) => p.name).join(', ');

  return (
    <>
      <tr
        className={`border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer transition-colors ${
          isExpanded ? 'bg-gray-900/70' : ''
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-center">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-orange-400 inline" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600 inline" />
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap font-medium">
          {formatDate(game.official_date)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-400">
          {formatTime(game)}
        </td>
        <td className="px-3 py-2">
          {isHome ? (
            <span className="flex items-center gap-1 text-green-400">
              <Home className="w-3.5 h-3.5" /> HOME
            </span>
          ) : (
            <span className="flex items-center gap-1 text-blue-400">
              <Plane className="w-3.5 h-3.5" /> AWAY
            </span>
          )}
        </td>
        <td className="px-3 py-2 font-medium whitespace-nowrap">{opponent}</td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
          {scoreDisplay(game)}
        </td>
        <td
          className={`px-3 py-2 whitespace-nowrap ${statusColor(game.status_detailed)}`}
        >
          {game.status_detailed}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-400">
          {game.venue_name}
        </td>
        <td className="px-3 py-2 text-center">
          {game.day_night === 'night' ? (
            <Moon className="w-3.5 h-3.5 text-indigo-400 inline" />
          ) : game.day_night === 'day' ? (
            <Sun className="w-3.5 h-3.5 text-yellow-400 inline" />
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </td>
        {isAuthenticated && (
          <>
            <td className="px-3 py-2 whitespace-nowrap text-center">
              {ticketSummary ? (
                <span className={ticketSummary.available > 0 ? 'text-green-400 font-medium' : 'text-gray-500'}>
                  {ticketSummary.available}/{ticketSummary.total}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
              )}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              <RequestCell
                game={game}
                isHome={isHome}
                myRequest={myRequest}
                myTickets={myTickets}
                onDataRefresh={onDataRefresh}
              />
            </td>
          </>
        )}
        <td className="px-3 py-2 text-gray-300 max-w-[300px]">
          {promoNames ? (
            <span className="flex items-center gap-1">
              <Gift className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
              <span className="truncate">{promoNames}</span>
            </span>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-900/50">
          <td colSpan={isAuthenticated ? 12 : 10} className="px-4 py-3">
            <GameDetail
              game={game}
              promotions={gamePromos}
              loading={loadingPromos}
              onClose={onToggle}
              userRole={userRole}
              myTickets={myTickets}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RequestCell({
  game,
  isHome,
  myRequest,
  myTickets,
  onDataRefresh,
}: {
  game: Game;
  isHome: boolean;
  myRequest?: TicketRequest;
  myTickets?: GameTicketDetail[];
  onDataRefresh: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [seats, setSeats] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createRequests([{ game_pk: game.game_pk, seats_requested: seats }]);
      setShowPicker(false);
      onDataRefresh();
    } catch {
      // error handling could be added
    } finally {
      setSubmitting(false);
    }
  };

  // Has allocated tickets — bright green check + count
  if (myTickets && myTickets.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 font-medium text-xs">
        <Check className="w-3.5 h-3.5" />
        {myTickets.length}
      </span>
    );
  }

  // Has a request (not withdrawn)
  if (myRequest && myRequest.status !== 'withdrawn') {
    if (myRequest.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-300 text-xs font-medium">
          <Check className="w-3 h-3" />
          {myRequest.seats_approved || myRequest.seats_requested}
        </span>
      );
    }
    if (myRequest.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
          <Clock className="w-3 h-3" />
          {myRequest.seats_requested}
        </span>
      );
    }
    // declined
    return <span className="text-red-400 text-xs">declined</span>;
  }

  // No personal status — away game or finished: dash
  if (!isHome || game.status_detailed === 'Final') {
    return <span className="text-gray-600">—</span>;
  }

  // Home game, not final, no request yet — clickable to request
  return (
    <div className="relative inline-flex items-center">
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-orange-400 hover:bg-gray-800 transition-colors"
          title="Request tickets"
        >
          <Ticket className="w-3.5 h-3.5" />
          Request
        </button>
      ) : (
        <>
          {/* Transparent overlay: catches clicks anywhere outside the picker, closes it, and stops event propagation */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setShowPicker(false); }}
          />
          <div className="relative z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 shadow-lg">
            <button
              onClick={() => setSeats(Math.max(1, seats - 1))}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-orange-400 w-4 text-center">{seats}</span>
            <button
              onClick={() => setSeats(Math.min(4, seats + 1))}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="ml-1 p-1 rounded bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 transition-colors"
              title="Submit request"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GameDetail({
  game,
  promotions,
  loading,
  onClose,
  userRole,
  myTickets,
}: {
  game: Game;
  promotions: Promotion[];
  loading: boolean;
  onClose: () => void;
  userRole: string | null;
  myTickets?: GameTicketDetail[];
}) {
  const [adminTickets, setAdminTickets] = useState<GameTicketWithUser[] | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);

  useEffect(() => {
    if (userRole !== 'admin') return;
    setLoadingTickets(true);
    fetchGameAllocation(game.game_pk)
      .then((detail) => setAdminTickets(detail.tickets))
      .catch(() => setAdminTickets([]))
      .finally(() => setLoadingTickets(false));
  }, [game.game_pk, userRole]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-orange-400">
            {game.away_team_name} @ {game.home_team_name}
          </h3>
          <p className="text-gray-400 text-sm">
            {formatDate(game.official_date)} · {formatTime(game)} ·{' '}
            {game.venue_name}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Game info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <InfoCard
          label="Series"
          value={
            game.series_description
              ? `${game.series_description} (Game ${game.series_game_number}/${game.games_in_series})`
              : '—'
          }
        />
        <InfoCard
          label="Day/Night"
          value={game.day_night === 'night' ? 'Night' : game.day_night === 'day' ? 'Day' : '—'}
        />
      </div>

      {/* Tickets — admin view */}
      {userRole === 'admin' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
            <Ticket className="w-4 h-4 text-orange-400" />
            Tickets
          </h4>
          {loadingTickets ? (
            <p className="text-gray-500 text-sm">Loading tickets…</p>
          ) : adminTickets && adminTickets.length > 0 ? (
            <div>
              <p className="text-xs text-gray-400 mb-2">
                {adminTickets.length} total ·{' '}
                {adminTickets.filter((t) => t.assigned_to).length} assigned ·{' '}
                {adminTickets.filter((t) => !t.assigned_to).length} available
              </p>
              <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
                {adminTickets.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                      t.assigned_to
                        ? 'bg-green-900/20 border border-green-900/30 text-green-300'
                        : 'bg-gray-800/50 border border-gray-700 text-gray-400'
                    }`}
                  >
                    <span>{t.section}:{t.row}{t.seat}</span>
                    {t.assigned_to ? (
                      <span className="text-gray-500 ml-2 truncate max-w-[120px]">
                        {t.assigned_user_name ?? `User #${t.assigned_to}`}
                      </span>
                    ) : (
                      <span className="text-gray-600">available</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : adminTickets ? (
            <p className="text-gray-600 text-sm">No tickets for this game.</p>
          ) : null}
        </div>
      )}

      {/* Tickets — regular user view */}
      {userRole !== 'admin' && myTickets && myTickets.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
            <Ticket className="w-4 h-4 text-orange-400" />
            My Tickets
          </h4>
          <div className="flex flex-wrap gap-2">
            {myTickets.map((t) => (
              <span
                key={t.id}
                className="px-2 py-1 rounded text-xs bg-green-900/20 border border-green-900/30 text-green-300"
              >
                {t.section}:{t.row}{t.seat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Promotions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-orange-400" />
          Promotions
        </h4>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading promotions…</p>
        ) : promotions.length === 0 ? (
          <p className="text-gray-600 text-sm">No promotions for this game.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {promotions.map((p) => (
              <div
                key={p.offer_id}
                className="flex gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700"
              >
                {p.thumbnail_url && (
                  <img
                    src={p.thumbnail_url}
                    alt={p.name}
                    className="w-14 h-14 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-white truncate">
                    {p.name}
                  </p>
                  {p.offer_type && (
                    <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-orange-400">
                      <Tag className="w-3 h-3" />
                      {p.offer_type}
                    </span>
                  )}
                  {p.distribution && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.distribution}
                    </p>
                  )}
                  {p.presented_by && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Presented by {p.presented_by}
                    </p>
                  )}
                  {p.description && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">
                      {p.description}
                    </p>
                  )}
                  <div className="flex gap-2 mt-1">
                    {p.alt_page_url && (
                      <a
                        href={p.alt_page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        More Info
                      </a>
                    )}
                    {p.ticket_link && (
                      <a
                        href={p.ticket_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Tickets
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-gray-800/50 border border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-200 truncate">{value}</p>
    </div>
  );
}
