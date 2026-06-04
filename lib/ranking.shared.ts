export const RANKING_FONT = "'Urbanist', var(--font-urbanist), sans-serif";

export type RankingUser = { id: string; name: string; totalPoint: number };

export type TournamentInfo = {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
} | null;

export type GroupedFishCatch = {
  fishName: string;
  totalPoints: number;
  count: number;
  img?: string;
};

export function maskName(name: string): string {
  if (!name) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

export function formatTournamentPeriod(tournament: TournamentInfo): string {
  if (!tournament) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${fmt(tournament.startDate)} ~ ${fmt(tournament.endDate)}`;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
