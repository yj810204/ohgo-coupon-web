import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function verifyUseCouponPassword(input: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'password')
    .maybeSingle();

  if (error || !data?.value) return false;

  const value = data.value as { type?: string; value?: string };
  if (value.type !== 'useCoupon') return false;
  return input === value.value;
}
