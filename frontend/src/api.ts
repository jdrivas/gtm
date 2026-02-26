import type { Game, GameTicketDetail, Promotion, TicketSummary } from './types';

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch('/api/games');
  if (!res.ok) throw new Error(`Failed to fetch games: ${res.statusText}`);
  return res.json();
}

export async function fetchPromotions(gamePk: number): Promise<Promotion[]> {
  const res = await fetch(`/api/games/${gamePk}/promotions`);
  if (!res.ok) throw new Error(`Failed to fetch promotions: ${res.statusText}`);
  return res.json();
}

export async function fetchTicketSummary(): Promise<TicketSummary[]> {
  const res = await fetch('/api/tickets/summary');
  if (!res.ok) throw new Error(`Failed to fetch ticket summary: ${res.statusText}`);
  return res.json();
}

export async function fetchGameTickets(gamePk: number): Promise<GameTicketDetail[]> {
  const res = await fetch(`/api/games/${gamePk}/tickets`);
  if (!res.ok) throw new Error(`Failed to fetch game tickets: ${res.statusText}`);
  return res.json();
}

export async function addSeatBatch(section: string, row: string, seatStart: number, seatEnd: number, notes?: string): Promise<import('./types').Seat[]> {
  const res = await fetch('/api/seats/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, row, seat_start: seatStart, seat_end: seatEnd, notes: notes || null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function deleteSeat(seatId: number): Promise<void> {
  const res = await fetch(`/api/seats/${seatId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function updateSeatGroupNotes(section: string, row: string, notes: string | null): Promise<import('./types').Seat[]> {
  const res = await fetch('/api/seats/group', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, row, notes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchSeats(): Promise<import('./types').Seat[]> {
  const res = await fetch('/api/seats');
  if (!res.ok) throw new Error(`Failed to fetch seats: ${res.statusText}`);
  return res.json();
}
