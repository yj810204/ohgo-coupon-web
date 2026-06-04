import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { UserActionLog } from './user-action-log-service.shared';

export async function getUserActionLogs(userId: string): Promise<UserActionLog[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_action_logs')
    .select('id, action, detail, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action ?? '',
    detail: row.detail ?? '',
    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
  }));
}

export async function clearUserActionLogs(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('user_action_logs').delete().eq('user_id', userId);
  if (error) throw error;
}
