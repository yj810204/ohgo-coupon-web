import { DATA_SOURCE } from '@/lib/data-source';
import type { BoardingFormData, BoardingFormRecord } from './boarding-service.shared';
import * as supa from './boarding-service.supabase';
import * as fb from './boarding-service.firebase';

export type { BoardingFormData, BoardingFormRecord };
export { isBoardingComplete } from './boarding-service.shared';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const getBoardingForm: typeof supa.getBoardingForm = (...a) => impl.getBoardingForm(...a);
export const saveBoardingForm: typeof supa.saveBoardingForm = (...a) =>
  impl.saveBoardingForm(...a);
