import { DATA_SOURCE } from '@/lib/data-source';
import type { CrewMember } from './find-captains.shared';
import * as supa from './find-captains.supabase';
import * as fb from './find-captains.firebase';

export type { CrewMember };

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const findCaptains: typeof supa.findCaptains = (...a) => impl.findCaptains(...a);
