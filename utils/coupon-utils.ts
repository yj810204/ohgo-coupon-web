import { DATA_SOURCE } from '@/lib/data-source';
import * as supa from './coupon-utils.supabase';
import * as fb from './coupon-utils.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const getTodayCouponsStatus: typeof supa.getTodayCouponsStatus = (...a) =>
  impl.getTodayCouponsStatus(...a);
