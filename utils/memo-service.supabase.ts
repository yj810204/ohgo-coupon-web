import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function addMemo(uuid: string, content: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_memos')
    .insert({ user_id: uuid, content })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function getMemos(uuid: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_memos')
    .select('id, content, created_at, updated_at, deleted')
    .eq('user_id', uuid)
    .eq('deleted', false)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted,
  }));
}

export async function updateMemo(uuid: string, memoId: string, content: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('user_memos')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', memoId)
    .eq('user_id', uuid);
  if (error) throw error;
}

export async function softDeleteMemo(uuid: string, memoId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('user_memos')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', memoId)
    .eq('user_id', uuid);
  if (error) throw error;
}
