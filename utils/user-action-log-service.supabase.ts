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

export async function addUserActionLog(
  userId: string,
  action: string,
  detail: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('user_action_logs').insert({
    user_id: userId,
    action,
    detail,
  });
  if (error) throw error;
}

export async function updateLatestUserActionLog(
  userId: string,
  action: string,
  fromDetail: string,
  toDetail: string
): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_action_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', action)
    .eq('detail', fromDetail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return false;
  const { error: updateError } = await supabase
    .from('user_action_logs')
    .update({ detail: toDetail })
    .eq('id', data.id);
  return !updateError;
}
