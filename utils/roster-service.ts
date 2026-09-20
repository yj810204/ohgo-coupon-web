import { DATA_SOURCE } from '@/lib/data-source';
import type {
  AttendanceRecord,
  ConfirmedTrip,
  MonthRosterSummary,
  RosterConfig,
  RosterItem,
} from './roster-service.shared';
import { buildAddress, formatBirthDate } from './roster-service.shared';
import * as supa from './roster-service.supabase';
import * as fb from './roster-service.firebase';

export type {
  AttendanceRecord,
  ConfirmedTrip,
  MonthRosterSummary,
  RosterConfig,
  RosterItem,
};
export { buildAddress, formatBirthDate };

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const getMonthRosterSummary: typeof supa.getMonthRosterSummary = (...a) =>
  impl.getMonthRosterSummary(...a);
export const getYearRosterSummary: typeof supa.getYearRosterSummary = (...a) =>
  impl.getYearRosterSummary(...a);
export const peekYearRosterSummary: typeof fb.peekYearRosterSummary = (...a) =>
  DATA_SOURCE === 'firebase' ? fb.peekYearRosterSummary(...a) : supa.peekYearRosterSummary(...a);
export const getYearConfirmedTripCount: typeof supa.getYearConfirmedTripCount = (...a) =>
  impl.getYearConfirmedTripCount(...a);
export const invalidateRosterSummaryCache: typeof supa.invalidateRosterSummaryCache = (...a) =>
  impl.invalidateRosterSummaryCache(...a);
export const getConfirmedTrip: typeof supa.getConfirmedTrip = (...a) =>
  impl.getConfirmedTrip(...a);
export const isTripConfirmed: typeof supa.isTripConfirmed = (...a) => impl.isTripConfirmed(...a);
export const getAttendance: typeof supa.getAttendance = (...a) => impl.getAttendance(...a);
export const saveAttendanceMembers: typeof supa.saveAttendanceMembers = (...a) =>
  impl.saveAttendanceMembers(...a);
export const clearAttendanceMembers: typeof supa.clearAttendanceMembers = (...a) =>
  impl.clearAttendanceMembers(...a);
export const updateAttendanceLocationTime: typeof supa.updateAttendanceLocationTime = (...a) =>
  impl.updateAttendanceLocationTime(...a);
export const confirmTripDeparture: typeof supa.confirmTripDeparture = (...a) =>
  impl.confirmTripDeparture(...a);
export const finalizeConfirmedTrip: typeof fb.finalizeConfirmedTrip = (...a) =>
  impl.finalizeConfirmedTrip(...a);
export const getRosterConfig: typeof supa.getRosterConfig = (...a) => impl.getRosterConfig(...a);
export const loadDailyRoster: typeof supa.loadDailyRoster = (...a) => impl.loadDailyRoster(...a);
export const removeMemberFromDailyRoster: typeof supa.removeMemberFromDailyRoster = (...a) =>
  impl.removeMemberFromDailyRoster(...a);
export const searchMembersByName: typeof supa.searchMembersByName = (...a) =>
  impl.searchMembersByName(...a);
export const createGuestMember: typeof supa.createGuestMember = (...a) =>
  impl.createGuestMember(...a);
export const guestMemberExists: typeof supa.guestMemberExists = (...a) =>
  impl.guestMemberExists(...a);
export const addMemberToDailyRoster: typeof supa.addMemberToDailyRoster = (...a) =>
  impl.addMemberToDailyRoster(...a);
export const saveConfirmedTripMembers: typeof supa.saveConfirmedTripMembers = (...a) =>
  impl.saveConfirmedTripMembers(...a);
export const getBoardedMemberIds: typeof supa.getBoardedMemberIds = (...a) =>
  impl.getBoardedMemberIds(...a);
export const findUserByNameDob: typeof supa.findUserByNameDob = (...a) =>
  impl.findUserByNameDob(...a);
