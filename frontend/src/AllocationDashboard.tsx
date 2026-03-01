import { useEffect, useState, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BarChart3, AlertTriangle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AllocationSummaryRow } from './types';
import { fetchAllocationSummary, fetchMe } from './api';

type SortKey = 'date' | 'opponent' | 'requested' | 'available';

export default function AllocationDashboard() {
  const { isAuthenticated } = useAuth0();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AllocationSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(true);
  const [opponentFilter, setOpponentFilter] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    fetchMe()
      .then((me) => {
        setIsAdmin(me.role === 'admin');
        if (me.role !== 'admin') {
          setLoading(false);
          return;
        }
        return fetchAllocationSummary()
          .then(setRows)
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      })
      .catch(() => {
        // token not ready yet or auth failure — show not-admin state
        setLoading(false);
      });
  }, [isAuthenticated]);

  const opponents = useMemo(
    () => [...new Set(rows.map((r) => r.away_team_name))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let data = rows;
    if (opponentFilter) {
      data = data.filter((r) => r.away_team_name === opponentFilter);
    }
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = a.official_date.localeCompare(b.official_date); break;
        case 'opponent': cmp = a.away_team_name.localeCompare(b.away_team_name); break;
        case 'requested': cmp = a.total_requested - b.total_requested; break;
        case 'available': cmp = a.available - b.available; break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, opponentFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

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

  const totalOversubscribed = filtered.filter((r) => r.oversubscribed).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-orange-500" />
          <h2 className="text-xl font-bold">Allocation Dashboard</h2>
          <span className="text-sm text-gray-500">({filtered.length} games)</span>
        </div>
        <div className="flex items-center gap-3">
          {totalOversubscribed > 0 && (
            <span className="flex items-center gap-1 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4" />
              {totalOversubscribed} oversubscribed
            </span>
          )}
          <select
            value={opponentFilter}
            onChange={(e) => setOpponentFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="">All opponents</option>
            {opponents.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort('date')}>
                Date{sortIndicator('date')}
              </th>
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort('opponent')}>
                Opponent{sortIndicator('opponent')}
              </th>
              <th className="py-2 px-3 text-center">Seats</th>
              <th className="py-2 px-3 text-center">Assigned</th>
              <th className="py-2 px-3 text-center cursor-pointer select-none" onClick={() => toggleSort('available')}>
                Available{sortIndicator('available')}
              </th>
              <th className="py-2 px-3 text-center cursor-pointer select-none" onClick={() => toggleSort('requested')}>
                Requested{sortIndicator('requested')}
              </th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.game_pk}
                className={`border-b border-gray-800/50 hover:bg-gray-900/50 cursor-pointer ${r.oversubscribed ? 'bg-yellow-900/10' : ''}`}
                onClick={() => navigate(`/admin/allocation/${r.game_pk}`)}
              >
                <td className="py-2 px-3">{r.official_date}</td>
                <td className="py-2 px-3">{r.away_team_name}</td>
                <td className="py-2 px-3 text-center">{r.total_seats}</td>
                <td className="py-2 px-3 text-center">
                  <span className={r.assigned > 0 ? 'text-green-400' : ''}>{r.assigned}</span>
                </td>
                <td className="py-2 px-3 text-center">{r.available}</td>
                <td className="py-2 px-3 text-center">
                  <span className={r.oversubscribed ? 'text-yellow-400 font-medium' : ''}>
                    {r.total_requested}
                    {r.oversubscribed && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-600">
                  <ChevronRight className="w-4 h-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
