import { DATA_SOURCE } from '@/lib/data-source';
import * as supa from './memo-service.supabase';
import * as fb from './memo-service.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const addMemo: typeof supa.addMemo = (...a) => impl.addMemo(...a);
export const getMemos: typeof supa.getMemos = (...a) => impl.getMemos(...a);
export const updateMemo: typeof supa.updateMemo = (...a) => impl.updateMemo(...a);
export const softDeleteMemo: typeof supa.softDeleteMemo = (...a) => impl.softDeleteMemo(...a);
