import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  omitUndefinedFields,
  type TripGuide,
  type TripGuideInput,
} from './trip-guide-shared';

function mapRow(row: Record<string, unknown>): TripGuide {
  const date = row.date as string;
  return {
    id: row.id as string,
    date: typeof date === 'string' ? date.split('T')[0] : String(date),
    destination: (row.destination as string) ?? '',
    departureTime: (row.departure_time as string) ?? '',
    returnTime: (row.return_time as string) ?? undefined,
    species: (row.species as string) ?? undefined,
    capacity: row.capacity != null ? Number(row.capacity) : undefined,
    price: row.price != null ? Number(row.price) : undefined,
    notes: (row.notes as string) ?? undefined,
    contact: (row.contact as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function inputToRow(input: Partial<TripGuideInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.date !== undefined) row.date = input.date;
  if (input.destination !== undefined) row.destination = input.destination;
  if (input.departureTime !== undefined) row.departure_time = input.departureTime;
  if (input.returnTime !== undefined) row.return_time = input.returnTime;
  if (input.species !== undefined) row.species = input.species;
  if (input.capacity !== undefined) row.capacity = input.capacity;
  if (input.price !== undefined) row.price = input.price;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.contact !== undefined) row.contact = input.contact;
  return row;
}

function monthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

export async function getTripsByMonth(yearMonth: string): Promise<TripGuide[]> {
  const start = `${yearMonth}-01`;
  const end = monthEndDate(yearMonth);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_guides')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row));
}

export async function getAllTrips(): Promise<TripGuide[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_guides')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row));
}

export async function getTripById(id: string): Promise<TripGuide | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('trip_guides').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function addTrip(input: TripGuideInput): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_guides')
    .insert(inputToRow(input))
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('출조 등록 실패');
  return data.id;
}

export async function updateTrip(id: string, input: Partial<TripGuideInput>): Promise<void> {
  const data = inputToRow(omitUndefinedFields(input));
  if (Object.keys(data).length === 0) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('trip_guides').update(data).eq('id', id);
  if (error) throw error;
}

export async function deleteTrip(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('trip_guides').delete().eq('id', id);
  if (error) throw error;
}

export async function getTripsInDateRange(startDate: string, endDate: string): Promise<TripGuide[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_guides')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row));
}

export type { TripGuide, TripGuideInput };
