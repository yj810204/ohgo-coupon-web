import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import * as trips from './trip-guide-service.supabase';

export type {
  TripGuide,
  TripGuideInput,
  TripScheduleDateBadgeVariant,
} from './trip-guide-shared';

export {
  tripDateToStr,
  isPastTripDate,
  tripDepartureDateTime,
  tripDepartureTimestamp,
  sortTripsByNearestDeparture,
  isPastTripSchedule,
  getWeekRange,
  getWeekDayDates,
  formatWeekRangeLabel,
  isSameWeek,
  isInOpenWeek,
  isTripDateViewable,
  getTripScheduleDateBadge,
  tripCalendarDayNumberColor,
  tripCalendarDotColor,
  tripWeekdayNumberColor,
  tripWeekdayLabelColor,
  tripSpeciesTitle,
  tripScheduleSubtitle,
  tripPricePerPersonLabel,
} from './trip-guide-shared';

const TRIPS_TTL_MS = 2 * 60_000;
const TRIPS_PREFIX = 'trips:';

function invalidateTrips() {
  invalidateCache(TRIPS_PREFIX);
}

export const getTripById = trips.getTripById;

export const getTripsByMonth: typeof trips.getTripsByMonth = (yearMonth) =>
  cachedFetch(`${TRIPS_PREFIX}month:${yearMonth}`, TRIPS_TTL_MS, () =>
    trips.getTripsByMonth(yearMonth)
  );

export const getAllTrips: typeof trips.getAllTrips = () =>
  cachedFetch(`${TRIPS_PREFIX}all`, TRIPS_TTL_MS, () => trips.getAllTrips());

export const countTrips: typeof trips.countTrips = () =>
  cachedFetch(`${TRIPS_PREFIX}count`, TRIPS_TTL_MS, () => trips.countTrips());

export const getTripsInDateRange: typeof trips.getTripsInDateRange = (startDate, endDate) =>
  cachedFetch(`${TRIPS_PREFIX}range:${startDate}:${endDate}`, TRIPS_TTL_MS, () =>
    trips.getTripsInDateRange(startDate, endDate)
  );

export const addTrip: typeof trips.addTrip = async (...a) => {
  const result = await trips.addTrip(...a);
  invalidateTrips();
  return result;
};

export const updateTrip: typeof trips.updateTrip = async (...a) => {
  const result = await trips.updateTrip(...a);
  invalidateTrips();
  return result;
};

export const deleteTrip: typeof trips.deleteTrip = async (...a) => {
  const result = await trips.deleteTrip(...a);
  invalidateTrips();
  return result;
};
