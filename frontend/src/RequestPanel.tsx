import { useState, useMemo } from 'react';
import { Send, Plus, Minus, X } from 'lucide-react';
import type { Game, TicketRequest } from './types';
import { createRequests } from './api';

interface Props {
  games: Game[];
  existingRequests: TicketRequest[];
  onClose: () => void;
  onSubmitted: () => void;
}

const GIANTS_TEAM_NAME = 'San Francisco Giants';

export default function RequestPanel({ games, existingRequests, onClose, onSubmitted }: Props) {
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingMap = useMemo(() => {
    const map: Record<number, TicketRequest> = {};
    for (const r of existingRequests) map[r.game_pk] = r;
    return map;
  }, [existingRequests]);

  const homeGames = useMemo(
    () => games
      .filter((g) => g.home_team_name === GIANTS_TEAM_NAME && g.status_detailed !== 'Final')
      .sort((a, b) => a.official_date.localeCompare(b.official_date)),
    [games],
  );

  const toggleGame = (gamePk: number) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (next[gamePk] !== undefined) {
        delete next[gamePk];
      } else {
        next[gamePk] = 2; // default 2 seats
      }
      return next;
    });
  };

  const setSeats = (gamePk: number, seats: number) => {
    setSelections((prev) => ({ ...prev, [gamePk]: Math.max(1, Math.min(4, seats)) }));
  };

  const selectedCount = Object.keys(selections).length;

  const handleSubmit = async () => {
    if (selectedCount === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const reqs = Object.entries(selections).map(([gpk, seats]) => ({
        game_pk: Number(gpk),
        seats_requested: seats,
      }));
      await createRequests(reqs);
      setSelections({});
      onSubmitted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="border border-orange-800/50 rounded-lg bg-gray-950 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-orange-400">Request Tickets</h3>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Submitting…' : `Submit ${selectedCount} Request${selectedCount > 1 ? 's' : ''}`}
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 mb-3 rounded bg-red-900/30 border border-red-800 text-red-400 text-sm">{error}</div>
      )}

      <p className="text-sm text-gray-500 mb-3">
        Select upcoming home games and choose how many seats you'd like (1–4). Already-requested games are marked.
      </p>

      <div className="max-h-[400px] overflow-y-auto space-y-1">
        {homeGames.map((g) => {
          const existing = existingMap[g.game_pk];
          const selected = selections[g.game_pk] !== undefined;
          const hasExisting = existing && existing.status !== 'withdrawn';

          return (
            <div
              key={g.game_pk}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors cursor-pointer ${
                selected ? 'bg-orange-900/20 border border-orange-800/50' :
                hasExisting ? 'bg-gray-800/30 border border-gray-800' :
                'hover:bg-gray-900 border border-transparent'
              }`}
              onClick={() => !hasExisting && toggleGame(g.game_pk)}
            >
              <div className="flex-1 flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => !hasExisting && toggleGame(g.game_pk)}
                  disabled={!!hasExisting}
                  className="rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-gray-800"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-sm font-medium w-32">{formatDate(g.official_date)}</span>
                <span className="text-sm text-gray-300">{g.away_team_name}</span>
                {hasExisting && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    existing.status === 'approved' ? 'bg-green-900/30 text-green-400' :
                    existing.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {existing.status} ({existing.seats_requested} seats)
                  </span>
                )}
              </div>
              {selected && (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setSeats(g.game_pk, selections[g.game_pk] - 1)}
                    className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-bold text-orange-400 w-5 text-center">{selections[g.game_pk]}</span>
                  <button
                    onClick={() => setSeats(g.game_pk, selections[g.game_pk] + 1)}
                    className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-gray-500 ml-1">seats</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
