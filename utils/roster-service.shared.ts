export type RosterItem = {
  id: string;
  name: string;
  birth: string;
  gender: string;
  phone: string;
  emergency: string;
  address: string;
  hasRoster: boolean;
  isCaptain?: boolean;
  isSailor?: boolean;
  role?: string;
};

export type ConfirmedTrip = {
  confirmed: boolean;
  confirmedAt?: string;
  rosterImagePath?: string;
  rosterImageUrl?: string;
};

export type MonthRosterSummary = {
  datesWithRoster: string[];
  confirmedTrips: Record<string, number[]>;
};

export type RosterConfig = {
  areas: string[];
  shipName: string;
  ton: string;
  desc01: string;
  desc02: string;
  onBoard: boolean;
};

export type AttendanceRecord = {
  memberIds: string[];
  tripNumber?: number;
  locations?: string[];
  arrivalTime?: string;
};

export function formatBirthDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

export function buildAddress(base: string, detail?: string): string {
  if (!detail?.trim()) return base;
  return `${base} ${detail}`.trim();
}
