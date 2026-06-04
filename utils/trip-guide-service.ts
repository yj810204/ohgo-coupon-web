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
} from './trip-guide-shared';

export * from './trip-guide-service.supabase';
