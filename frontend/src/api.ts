import type { Game, GameTicketDetail, Promotion, Seat, TicketSummary, TicketRequest, AllocationSummaryRow, GameAllocationDetail, User } from './types';

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

// --- User ---

export async function fetchMe(): Promise<User> {
  const res = await authFetch('/api/users/me');
  if (!res.ok) throw new Error(`Failed to fetch user: ${res.statusText}`);
  return res.json();
}

// --- Ticket Requests ---

export async function fetchMyRequests(): Promise<TicketRequest[]> {
  const res = await authFetch('/api/my/requests');
  if (!res.ok) throw new Error(`Failed to fetch requests: ${res.statusText}`);
  return res.json();
}

export async function createRequests(requests: { game_pk: number; seats_requested: number; notes?: string }[]): Promise<TicketRequest[]> {
  const res = await authFetch('/api/my/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function updateRequest(requestId: number, seatsRequested: number): Promise<void> {
  const res = await authFetch(`/api/my/requests/${requestId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seats_requested: seatsRequested }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function withdrawRequest(requestId: number): Promise<void> {
  const res = await authFetch(`/api/my/requests/${requestId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

// --- My Games ---

export async function fetchMyGames(): Promise<GameTicketDetail[]> {
  const res = await authFetch('/api/my/games');
  if (!res.ok) throw new Error(`Failed to fetch my games: ${res.statusText}`);
  return res.json();
}

export async function releaseGameTickets(gamePk: number): Promise<{ released: number }> {
  const res = await authFetch(`/api/my/games/${gamePk}/release`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// --- Admin: Allocation ---

export async function fetchAllocationSummary(): Promise<AllocationSummaryRow[]> {
  const res = await authFetch('/api/admin/allocation');
  if (!res.ok) throw new Error(`Failed to fetch allocation: ${res.statusText}`);
  return res.json();
}

export async function fetchGameAllocation(gamePk: number): Promise<GameAllocationDetail> {
  const res = await authFetch(`/api/admin/allocation/${gamePk}`);
  if (!res.ok) throw new Error(`Failed to fetch game allocation: ${res.statusText}`);
  return res.json();
}

export async function allocateTickets(assignments: { game_ticket_id: number; user_id: number; request_id?: number }[]): Promise<{ assigned: number }> {
  const res = await authFetch('/api/admin/allocate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function revokeTicket(gameTicketId: number): Promise<void> {
  const res = await authFetch(`/api/admin/allocate/${gameTicketId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function fetchAllocationByUser(userId: number): Promise<GameTicketDetail[]> {
  const res = await authFetch(`/api/admin/allocation/by-user/${userId}`);
  if (!res.ok) throw new Error(`Failed to fetch user allocation: ${res.statusText}`);
  return res.json();
}

export async function fetchAdminRequests(): Promise<TicketRequest[]> {
  const res = await authFetch('/api/admin/requests');
  if (!res.ok) throw new Error(`Failed to fetch admin requests: ${res.statusText}`);
  return res.json();
}
