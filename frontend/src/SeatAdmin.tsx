import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Armchair, AlertCircle, Loader2, Pencil, Check, X } from 'lucide-react';
import type { Seat } from './types';
import { fetchSeats, addSeatBatch, deleteSeat, updateSeatGroupNotes } from './api';

interface SeatGroup {
  section: string;
  row: string;
  seats: Seat[];
}

export default function SeatAdmin() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  // Form state
  const [section, setSection] = useState('');
  const [row, setRow] = useState('');
  const [seatStart, setSeatStart] = useState('');
  const [seatEnd, setSeatEnd] = useState('');
  const [notes, setNotes] = useState('');

  const loadSeats = () => {
    setLoading(true);
    fetchSeats()
      .then(setSeats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSeats();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SeatGroup>();
    for (const s of seats) {
      const key = `${s.section}|${s.row}`;
      if (!map.has(key)) {
        map.set(key, { section: s.section, row: s.row, seats: [] });
      }
      map.get(key)!.seats.push(s);
    }
    const result = Array.from(map.values());
    result.sort((a, b) => a.section.localeCompare(b.section) || a.row.localeCompare(b.row));
    for (const g of result) {
      g.seats.sort((a, b) => {
        const na = parseInt(a.seat, 10);
        const nb = parseInt(b.seat, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.seat.localeCompare(b.seat);
      });
    }
    return result;
  }, [seats]);

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const s = parseInt(seatStart, 10);
    const end = parseInt(seatEnd, 10);
    if (!section.trim() || !row.trim()) {
      setFormError('Section and Row are required.');
      return;
    }
    if (isNaN(s) || isNaN(end) || s < 1 || end < s) {
      setFormError('Enter a valid seat range (start ≤ end).');
      return;
    }
    if (end - s >= 50) {
      setFormError('Maximum 50 seats per batch.');
      return;
    }

    setSubmitting(true);
    try {
      await addSeatBatch(section.trim(), row.trim(), s, end, notes.trim() || undefined);
      setSection('');
      setRow('');
      setSeatStart('');
      setSeatEnd('');
      setNotes('');
      loadSeats();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add seats');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSeat = async (seatId: number) => {
    setDeletingIds((prev) => new Set(prev).add(seatId));
    try {
      await deleteSeat(seatId);
      setSeats((prev) => prev.filter((s) => s.id !== seatId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete seat');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }
  };

  const startEditGroup = (group: SeatGroup) => {
    const key = `${group.section}|${group.row}`;
    setEditingGroup(key);
    setEditNotes(group.seats[0]?.notes ?? '');
  };

  const cancelEditGroup = () => {
    setEditingGroup(null);
    setEditNotes('');
  };

  const handleSaveGroupNotes = async (group: SeatGroup) => {
    setSavingGroup(true);
    try {
      const updated = await updateSeatGroupNotes(
        group.section,
        group.row,
        editNotes.trim() || null,
      );
      setSeats(updated);
      setEditingGroup(null);
      setEditNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update notes');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (group: SeatGroup) => {
    const ids = group.seats.map((s) => s.id);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      for (const id of ids) {
        await deleteSeat(id);
      }
      setSeats((prev) => prev.filter((s) => !ids.includes(s.id)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
      loadSeats();
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Seat Group Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Seat Group
        </h2>
        <form onSubmit={handleAddBatch} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Section</label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. 127"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Row</label>
              <input
                type="text"
                value={row}
                onChange={(e) => setRow(e.target.value)}
                placeholder="e.g. A"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seat Start</label>
              <input
                type="number"
                min="1"
                value={seatStart}
                onChange={(e) => setSeatStart(e.target.value)}
                placeholder="1"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seat End</label>
              <input
                type="number"
                min="1"
                value={seatEnd}
                onChange={(e) => setSeatEnd(e.target.value)}
                placeholder="4"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Season 2025 tickets"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          {formError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm px-4 py-2 rounded transition-colors flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Seats
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300 text-xs">
            dismiss
          </button>
        </div>
      )}

      {/* Seat list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : seats.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Armchair className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No seats registered</p>
          <p className="text-sm mt-1">Use the form above to add a group of seats.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Season Ticket Seats
            </h2>
            <span className="text-sm text-gray-500">
              {seats.length} seat{seats.length !== 1 ? 's' : ''} in {groups.length} group{groups.length !== 1 ? 's' : ''}
            </span>
          </div>

          {groups.map((group) => {
            const groupKey = `${group.section}|${group.row}`;
            const allDeleting = group.seats.every((s) => deletingIds.has(s.id));
            const seatNums = group.seats.map((s) => s.seat);
            const rangeLabel = seatNums.length === 1 ? `Seat ${seatNums[0]}` : `Seats ${seatNums[0]}–${seatNums[seatNums.length - 1]}`;
            const isEditing = editingGroup === groupKey;
            const groupNotes = group.seats[0]?.notes;

            return (
              <div
                key={groupKey}
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 border-b border-gray-800">
                  <div className="flex items-center gap-3">
                    <Armchair className="w-5 h-5 text-orange-400" />
                    <div>
                      <span className="font-semibold text-white">
                        Section {group.section}, Row {group.row}
                      </span>
                      <span className="text-gray-500 text-sm ml-2">
                        — {rangeLabel} ({group.seats.length} seat{group.seats.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditGroup(group)}
                      disabled={isEditing || allDeleting}
                      className="text-gray-400 hover:text-orange-400 disabled:opacity-30 text-xs font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                      title="Edit group notes"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      disabled={allDeleting}
                      className="text-red-500 hover:text-red-400 disabled:opacity-30 text-xs font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-900/30"
                      title="Delete entire group"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Group
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-4 py-3 bg-gray-800/40 border-b border-gray-800 flex items-center gap-3">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Notes</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes for this seat group…"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGroupNotes(group);
                        if (e.key === 'Escape') cancelEditGroup();
                      }}
                    />
                    <button
                      onClick={() => handleSaveGroupNotes(group)}
                      disabled={savingGroup}
                      className="text-green-500 hover:text-green-400 disabled:opacity-50 p-1.5 rounded hover:bg-green-900/20 transition-colors"
                      title="Save"
                    >
                      {savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cancelEditGroup}
                      disabled={savingGroup}
                      className="text-gray-400 hover:text-white disabled:opacity-50 p-1.5 rounded hover:bg-gray-700 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {!isEditing && groupNotes && (
                  <div className="px-4 py-2 bg-gray-800/20 border-b border-gray-800 text-xs text-gray-400">
                    {groupNotes}
                  </div>
                )}
                <div className="divide-y divide-gray-800">
                  {group.seats.map((s) => {
                    const isDeleting = deletingIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between px-4 py-2.5 ${
                          isDeleting ? 'opacity-40' : 'hover:bg-gray-800/50'
                        } transition-all`}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-gray-400 text-xs font-mono w-8">
                            #{s.id}
                          </span>
                          <span className="text-white text-sm font-medium">
                            Seat {s.seat}
                          </span>
                          {s.notes && (
                            <span className="text-gray-500 text-xs">{s.notes}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSeat(s.id);
                          }}
                          disabled={isDeleting}
                          className="text-gray-600 hover:text-red-400 disabled:opacity-30 transition-colors p-1 rounded hover:bg-red-900/20"
                          title={`Delete seat ${s.seat}`}
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
