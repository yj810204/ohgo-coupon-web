import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { findCaptains } from './find-captains.supabase';
import {
  buildAddress,
  formatBirthDate,
  type AttendanceRecord,
  type ConfirmedTrip,
  type MonthRosterSummary,
  type RosterConfig,
  type RosterItem,
} from './roster-service.shared';

function mapMembers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
}

export async function getMonthRosterSummary(
  startDate: string,
  endDate: string
): Promise<MonthRosterSummary> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('attendance')
    .select('date, members')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  const datesWithRoster: string[] = [];
  (data ?? []).forEach((row) => {
    const members = mapMembers(row.members);
    if (members.length > 0) datesWithRoster.push(row.date);
  });

  const { data: trips, error: tripsError } = await supabase
    .from('confirmed_trips')
    .select('date, trip_number')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('confirmed', true);

  if (tripsError) throw tripsError;

  const confirmedTrips: Record<string, number[]> = {};
  (trips ?? []).forEach((row) => {
    if (!confirmedTrips[row.date]) confirmedTrips[row.date] = [];
    confirmedTrips[row.date].push(row.trip_number);
  });

  return { datesWithRoster, confirmedTrips };
}

export async function getYearConfirmedTripCount(year: number): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from('confirmed_trips')
    .select('*', { count: 'exact', head: true })
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .eq('confirmed', true);

  if (error) throw error;
  return count ?? 0;
}

export async function getConfirmedTrip(date: string, tripNumber: number): Promise<ConfirmedTrip | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('confirmed_trips')
    .select('*')
    .eq('date', date)
    .eq('trip_number', tripNumber)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    confirmed: data.confirmed,
    confirmedAt: data.confirmed_at ?? undefined,
    rosterImagePath: data.roster_image_path ?? undefined,
    rosterImageUrl: data.roster_image_url ?? undefined,
  };
}

export async function isTripConfirmed(date: string, tripNumber: number): Promise<boolean> {
  const trip = await getConfirmedTrip(date, tripNumber);
  return Boolean(trip?.confirmed);
}

export async function getAttendance(date: string): Promise<AttendanceRecord> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('attendance')
    .select('members, trip_number, locations, arrival_time')
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { memberIds: [] };

  return {
    memberIds: mapMembers(data.members),
    tripNumber: data.trip_number ?? undefined,
    locations: data.locations ?? undefined,
    arrivalTime: data.arrival_time ?? undefined,
  };
}

export async function saveAttendanceMembers(
  date: string,
  memberIds: string[],
  tripNumber?: number
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row: Record<string, unknown> = {
    date,
    members: memberIds,
    updated_at: new Date().toISOString(),
  };
  if (tripNumber !== undefined) row.trip_number = tripNumber;

  const { error } = await supabase.from('attendance').upsert(row, { onConflict: 'date' });
  if (error) throw error;
}

export async function clearAttendanceMembers(date: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('attendance')
    .update({ members: [], updated_at: new Date().toISOString() })
    .eq('date', date);
  if (error) throw error;
}

export async function updateAttendanceLocationTime(
  date: string,
  locations: string[],
  arrivalTime: string,
  tripNumber: number
): Promise<void> {
  const attendance = await getAttendance(date);
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('attendance').upsert(
    {
      date,
      members: attendance.memberIds,
      locations,
      arrival_time: arrivalTime,
      trip_number: tripNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date' }
  );
  if (error) throw error;
}

export async function confirmTripDeparture(
  date: string,
  tripNumber: number,
  imageBlob: Blob
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const imagePath = `${date}/trip${tripNumber}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('rosters')
    .upload(imagePath, imageBlob, { upsert: true, contentType: 'image/jpeg' });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('rosters').getPublicUrl(imagePath);
  const downloadURL = urlData.publicUrl;

  const { error } = await supabase.from('confirmed_trips').upsert(
    {
      date,
      trip_number: tripNumber,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      roster_image_path: imagePath,
      roster_image_url: downloadURL,
    },
    { onConflict: 'date,trip_number' }
  );
  if (error) throw error;

  await clearAttendanceMembers(date);
  return downloadURL;
}

export async function getRosterConfig(): Promise<RosterConfig> {
  const fallbackAreas = ['내만'];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'roster')
    .maybeSingle();

  if (error || !data?.value) {
    return {
      areas: fallbackAreas,
      shipName: '',
      ton: '',
      desc01: '',
      desc02: '',
      onBoard: false,
    };
  }

  const value = data.value as Record<string, unknown>;
  const areas = Array.isArray(value.areas) && value.areas.length ? (value.areas as string[]) : fallbackAreas;
  return {
    areas,
    shipName: String(value.ship_name ?? ''),
    ton: String(value.ton ?? ''),
    desc01: String(value.desc01 ?? ''),
    desc02: String(value.desc02 ?? ''),
    onBoard: Boolean(value.on_board),
  };
}

async function buildRosterItemFromGuest(guestId: string): Promise<RosterItem | null> {
  const supabase = getSupabaseBrowserClient();
  const [{ data: guest }, { data: boarding }] = await Promise.all([
    supabase.from('guest_profiles').select('name, dob').eq('id', guestId).is('merged_to', null).maybeSingle(),
    supabase.from('guest_boarding_info').select('*').eq('guest_id', guestId).maybeSingle(),
  ]);

  if (!guest) return null;

  const hasRoster = Boolean(boarding);

  let item: RosterItem = {
    id: guestId,
    name: guest.name || '',
    birth: formatBirthDate(guest.dob || ''),
    gender: '',
    phone: '',
    emergency: '',
    address: '',
    hasRoster,
    isCaptain: false,
    isSailor: false,
  };

  if (boarding) {
    item = {
      ...item,
      name: boarding.name || item.name,
      birth: formatBirthDate(boarding.birth || '') || item.birth,
      gender: boarding.gender || '',
      phone: boarding.phone || '',
      emergency: boarding.emergency || '',
      address: buildAddress(boarding.address || '', boarding.address_detail ?? undefined),
    };
  }

  return item;
}

async function buildRosterItemFromMemberId(memberId: string, role?: string): Promise<RosterItem | null> {
  const fromProfile = await buildRosterItemFromProfile(memberId, role);
  if (fromProfile) return fromProfile;
  return buildRosterItemFromGuest(memberId);
}
async function buildRosterItemFromProfile(
  userId: string,
  role?: string
): Promise<RosterItem | null> {
  const supabase = getSupabaseBrowserClient();
  const [{ data: profile }, { data: boarding }] = await Promise.all([
    supabase.from('profiles').select('name, dob').eq('id', userId).maybeSingle(),
    supabase.from('boarding_info').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (!profile) return null;

  const hasRoster = Boolean(boarding);
  const isCaptain = role === 'captain';
  const isSailor = role === 'sailor';

  let item: RosterItem = {
    id: userId,
    name: profile.name || '',
    birth: formatBirthDate(profile.dob || ''),
    gender: '',
    phone: '',
    emergency: '',
    address: '',
    hasRoster,
    isCaptain,
    isSailor,
    role,
  };

  if (boarding) {
    item = {
      ...item,
      name: boarding.name || item.name,
      birth: formatBirthDate(boarding.birth || '') || item.birth,
      gender: boarding.gender || '',
      phone: boarding.phone || '',
      emergency: boarding.emergency || '',
      address: buildAddress(boarding.address || '', boarding.address_detail ?? undefined),
    };
  }

  return item;
}

export async function loadDailyRoster(date: string, tripNumber: number): Promise<RosterItem[]> {
  const crewMembers = await findCaptains();
  const crewIds = crewMembers.map((m) => m.uuid);
  const captainIds = crewMembers.filter((m) => m.role === 'captain').map((m) => m.uuid);

  const attendance = await getAttendance(date);
  let memberIds = [...attendance.memberIds];

  if (captainIds.length > 0) {
    memberIds = Array.from(new Set([...memberIds, ...captainIds]));
    await saveAttendanceMembers(date, memberIds, tripNumber);
  }

  const rosterData: RosterItem[] = [];

  for (const crew of crewMembers) {
    const item = await buildRosterItemFromMemberId(crew.uuid, crew.role);
    if (item) rosterData.push(item);
  }

  for (const memberId of memberIds) {
    if (crewIds.includes(memberId)) continue;
    const item = await buildRosterItemFromMemberId(memberId);
    if (item) rosterData.push(item);
  }

  rosterData.sort((a, b) => {
    if (a.isCaptain && !b.isCaptain) return -1;
    if (!a.isCaptain && b.isCaptain) return 1;
    if (a.isSailor && !b.isSailor) return -1;
    if (!a.isSailor && b.isSailor) return 1;
    return a.name.localeCompare(b.name);
  });

  return rosterData;
}

export async function removeMemberFromDailyRoster(date: string, memberId: string): Promise<void> {
  const attendance = await getAttendance(date);
  const updated = attendance.memberIds.filter((id) => id !== memberId);
  await saveAttendanceMembers(date, updated, attendance.tripNumber);
}

export async function searchMembersByName(queryText: string) {
  if (!queryText.trim()) return [];
  const supabase = getSupabaseBrowserClient();
  const q = `%${queryText}%`;

  const [{ data: profiles, error: profilesError }, { data: guests, error: guestsError }] =
    await Promise.all([
      supabase.from('profiles').select('id, name, dob, phone').ilike('name', q),
      supabase
        .from('guest_profiles')
        .select('id, name, dob, phone')
        .ilike('name', q)
        .is('merged_to', null),
    ]);

  if (profilesError) throw profilesError;
  if (guestsError) throw guestsError;

  const profileResults = await Promise.all(
    (profiles ?? []).map(async (row) => {
      const { data: boarding } = await supabase
        .from('boarding_info')
        .select('user_id')
        .eq('user_id', row.id)
        .maybeSingle();
      return {
        id: row.id,
        uuid: row.id,
        name: row.name,
        dob: row.dob ?? undefined,
        phone: row.phone ?? undefined,
        hasBoarding: Boolean(boarding),
        isGuest: false,
      };
    })
  );

  const guestResults = await Promise.all(
    (guests ?? []).map(async (row) => {
      const { data: boarding } = await supabase
        .from('guest_boarding_info')
        .select('guest_id')
        .eq('guest_id', row.id)
        .maybeSingle();
      return {
        id: row.id,
        uuid: row.id,
        name: row.name,
        dob: row.dob ?? undefined,
        phone: row.phone ?? undefined,
        hasBoarding: Boolean(boarding),
        isGuest: true,
      };
    })
  );

  return [...profileResults, ...guestResults];
}

export async function createGuestMember(input: {
  uuid: string;
  name: string;
  dob: string;
  phone: string;
  gender: string;
  emergency: string;
  address: string;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error: profileError } = await supabase.from('guest_profiles').insert({
    id: input.uuid,
    name: input.name,
    dob: input.dob,
    phone: input.phone || null,
  });
  if (profileError) throw profileError;

  const { error: boardingError } = await supabase.from('guest_boarding_info').insert({
    guest_id: input.uuid,
    name: input.name,
    birth: input.dob,
    gender: input.gender,
    phone: input.phone,
    emergency: input.emergency,
    address: input.address,
  });
  if (boardingError) throw boardingError;
}

export async function guestMemberExists(uuid: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const [{ data: profile }, { data: guest }] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', uuid).maybeSingle(),
    supabase.from('guest_profiles').select('id').eq('id', uuid).is('merged_to', null).maybeSingle(),
  ]);
  return Boolean(profile || guest);
}

export async function addMemberToDailyRoster(
  date: string,
  memberId: string,
  tripNumber: number
): Promise<boolean> {
  const attendance = await getAttendance(date);
  if (attendance.memberIds.includes(memberId)) return false;
  await saveAttendanceMembers(date, [...attendance.memberIds, memberId], tripNumber);
  return true;
}
