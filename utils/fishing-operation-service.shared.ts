export type FishingLog = {
  id: string;
  captainId: string | null;
  date: string;
  departureTime?: string;
  arrivalTime?: string;
  area?: string;
  species: string[];
  catchKg?: number;
  waterTemp?: number;
  weather?: string;
  revenue?: number;
  notes?: string;
  createdAt: string;
};

export type FishingLogInput = {
  date: string;
  departureTime?: string;
  arrivalTime?: string;
  area?: string;
  species?: string[];
  catchKg?: number;
  waterTemp?: number;
  weather?: string;
  revenue?: number;
  notes?: string;
};

export type FishingLogMonthlyStats = {
  tripCount: number;
  totalCatchKg: number;
  totalRevenue: number;
  speciesTotals: { species: string; count: number }[];
};

export function parseSpeciesInput(raw: string): string[] {
  return raw
    .split(/[,，/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatSpeciesDisplay(species: string[] | undefined): string {
  if (!species?.length) return '—';
  return species.join(', ');
}
