import type { Game, GameTicketDetail, Promotion, Seat, TicketSummary } from './types';

// --- Auth-aware fetch ---

type GetTokenFn = () => Promise<string | null>;

let _getToken: GetTokenFn = async () => null;

export function setTokenGetter(fn: GetTokenFn) {
  _getToken = fn;
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await _getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

// --- API functions ---

export async function fetchGames(): Promise<Game[]> {
  const res = await authFetch('/api/games');
  if (!res.ok) throw new Error(`Failed to fetch games: ${res.statusText}`);
  return res.json();
}

export async function fetchPromotions(gamePk: number): Promise<Promotion[]> {
  const res = await authFetch(`/api/games/${gamePk}/promotions`);
  if (!res.ok) throw new Error(`Failed to fetch promotions: ${res.statusText}`);
  return res.json();
}

export async function fetchTicketSummary(): Promise<TicketSummary[]> {
  const res = await authFetch('/api/tickets/summary');
  if (!res.ok) throw new Error(`Failed to fetch ticket summary: ${res.statusText}`);
  return res.json();
}

export async function fetchGameTickets(gamePk: number): Promise<GameTicketDetail[]> {
  const res = await authFetch(`/api/games/${gamePk}/tickets`);
  if (!res.ok) throw new Error(`Failed to fetch game tickets: ${res.statusText}`);
  return res.json();
}

export async function addSeatBatch(section: string, row: string, seatStart: number, seatEnd: number, notes?: string): Promise<Seat[]> {
  const res = await authFetch('/api/seats/batch', {
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
  const res = await authFetch(`/api/seats/${seatId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function updateSeatGroupNotes(section: string, row: string, notes: string | null): Promise<Seat[]> {
  const res = await authFetch('/api/seats/group', {
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

export async function fetchSeats(): Promise<Seat[]> {
  const res = await authFetch('/api/seats');
  if (!res.ok) throw new Error(`Failed to fetch seats: ${res.statusText}`);
  return res.json();
}
