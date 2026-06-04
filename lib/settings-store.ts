import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function getSettingsValue<T>(key: string, defaultValue: T): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`settings get error (${key}):`, error);
    return defaultValue;
  }

  return (data?.value as T) ?? defaultValue;
}

export async function setSettingsValue(key: string, value: unknown): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('site_settings').upsert({ key, value });
  if (error) throw error;
}
