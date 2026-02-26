import type { Game, Promotion } from './types';

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
