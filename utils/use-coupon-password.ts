import { DATA_SOURCE } from '@/lib/data-source';
import * as supa from './use-coupon-password.supabase';
import * as fb from './use-coupon-password.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const verifyUseCouponPassword: typeof supa.verifyUseCouponPassword = (...a) =>
  impl.verifyUseCouponPassword(...a);
