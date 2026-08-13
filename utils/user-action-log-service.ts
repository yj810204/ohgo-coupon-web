import { DATA_SOURCE } from '@/lib/data-source';
import * as supa from './user-action-log-service.supabase';
import * as fb from './user-action-log-service.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const getUserActionLogs: typeof supa.getUserActionLogs = (...a) =>
  impl.getUserActionLogs(...a);
export const clearUserActionLogs: typeof supa.clearUserActionLogs = (...a) =>
  impl.clearUserActionLogs(...a);
