import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  FishingLog,
  FishingLogInput,
  FishingLogMonthlyStats,
} from './fishing-operation-service.shared';

function monthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

function mapRow(row: Record<string, unknown>): FishingLog {
  const date = row.date as string;
  return {
    id: row.id as string,
    captainId: (row.captain_id as string) ?? null,
    date: typeof date === 'string' ? date.split('T')[0] : String(date),
    departureTime: (row.departure_time as string) ?? undefined,
    arrivalTime: (row.arrival_time as string) ?? undefined,
    area: (row.area as string) ?? undefined,
    species: (row.species as string[]) ?? [],
    catchKg: row.catch_kg != null ? Number(row.catch_kg) : undefined,
    waterTemp: row.water_temp != null ? Number(row.water_temp) : undefined,
    weather: (row.weather as string) ?? undefined,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    notes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function inputToRow(input: FishingLogInput, captainId?: string): Record<string, unknown> {
  const row: Record<string, unknown> = {
    date: input.date,
    departure_time: input.departureTime ?? null,
    arrival_time: input.arrivalTime ?? null,
    area: input.area ?? null,
    species: input.species ?? [],
    catch_kg: input.catchKg ?? null,
    water_temp: input.waterTemp ?? null,
    weather: input.weather ?? null,
    revenue: input.revenue ?? null,
    notes: input.notes ?? null,
  };
  if (captainId) row.captain_id = captainId;
  return row;
}

export async function getLogsByMonth(yearMonth: string): Promise<FishingLog[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('fishing_logs')
    .select('*')
    .gte('date', `${yearMonth}-01`)
    .lte('date', monthEndDate(yearMonth))
    .order('date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row));
}

export async function getLogById(id: string): Promise<FishingLog | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('fishing_logs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function createLog(input: FishingLogInput, captainId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('fishing_logs')
    .insert(inputToRow(input, captainId))
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateLog(id: string, input: FishingLogInput): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('fishing_logs').update(inputToRow(input)).eq('id', id);
  if (error) throw error;
}

export async function deleteLog(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('fishing_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function getMonthlyStats(yearMonth: string): Promise<FishingLogMonthlyStats> {
  const logs = await getLogsByMonth(yearMonth);

  let totalCatchKg = 0;
  let totalRevenue = 0;
  const speciesCount = new Map<string, number>();

  for (const log of logs) {
    if (log.catchKg) totalCatchKg += log.catchKg;
    if (log.revenue) totalRevenue += log.revenue;
    for (const sp of log.species) {
      speciesCount.set(sp, (speciesCount.get(sp) ?? 0) + 1);
    }
  }

  const speciesTotals = [...speciesCount.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);

  return {
    tripCount: logs.length,
    totalCatchKg,
    totalRevenue,
    speciesTotals,
  };
}
