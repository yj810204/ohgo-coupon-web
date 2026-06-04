import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/utils/send-push';

const BOAT_QR_CODE = 'OHGO-STAMP-BOAT19033326262005';

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

async function logAction(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  detail: string
) {
  await supabase.from('user_action_logs').insert({ user_id: userId, action, detail });
}

async function insertStampHistory(
  supabase: SupabaseClient,
  userId: string,
  row: {
    stamp_id?: string | null;
    action: string;
    date?: string;
    method?: string;
    message?: string;
  }
) {
  await supabase.from('stamp_history').insert({
    user_id: userId,
    stamp_id: row.stamp_id ?? null,
    action: row.action,
    date: row.date,
    method: row.method,
    message: row.message,
  });
}

async function issueCoupon(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('coupons').insert({
    user_id: userId,
    issued_at: getTodayDate(),
    reason: '10회 적립 100% 할인',
    used: false,
    is_half: false,
  });
  await logAction(supabase, userId, '쿠폰 발급', '10회 적립 100% 할인 쿠폰 발급');
}

async function clearStamps(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id, date, method')
    .eq('user_id', userId);

  if (error) throw error;

  for (const s of stamps ?? []) {
    await insertStampHistory(supabase, userId, {
      stamp_id: s.id,
      action: 'remove',
      date: s.date ?? undefined,
      method: s.method ?? undefined,
      message: '쿠폰 발급으로 스탬프 삭제',
    });
  }

  await supabase.from('stamps').delete().eq('user_id', userId);
  await logAction(supabase, userId, '스탬프 초기화', '10개 스탬프 삭제');
}

export async function validateQrCode(qrData: string): Promise<boolean> {
  if (!qrData || typeof qrData !== 'string') return false;
  if (qrData === BOAT_QR_CODE) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from('qr_codes')
    .select('code')
    .eq('code', qrData)
    .eq('active', true)
    .maybeSingle();
  return Boolean(data);
}

async function addStamp(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = Date.now();
  const { start, end } = getTodayRange();

  const { data: usedCoupons } = await supabase
    .from('coupons')
    .select('issued_at, used_at')
    .eq('user_id', userId)
    .eq('used', true);

  const hasUsedToday = (usedCoupons ?? []).some((c) => {
    if (c.used_at) {
      const usedDate = new Date(c.used_at);
      return usedDate >= start && usedDate <= end;
    }
    if (c.issued_at) {
      const issuedDate = new Date(`${c.issued_at}T00:00:00`);
      return issuedDate >= start && issuedDate <= end;
    }
    return false;
  });

  if (hasUsedToday) {
    throw new Error(
      '오늘은 쿠폰 사용으로 QR 스탬프 적립이 제한됩니다.\n추가 적립은 선장님께 문의해주세요.'
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_stamp_time')
    .eq('id', userId)
    .maybeSingle();

  const lastStampTime = profile?.last_stamp_time
    ? new Date(profile.last_stamp_time).getTime()
    : 0;

  const LIMIT_MS = 8 * 60 * 60 * 1000;

  if (lastStampTime && now - lastStampTime < LIMIT_MS) {
    const nextAvailable = new Date(lastStampTime + LIMIT_MS);
    const hours = nextAvailable.getHours().toString().padStart(2, '0');
    const minutes = nextAvailable.getMinutes().toString().padStart(2, '0');
    throw new Error(
      `다음 적립은 ${hours}:${minutes} 이후에 가능합니다.\n추가 적립은 선장님께 문의해주세요.`
    );
  }

  const stampCreatedAt = new Date().toISOString();
  const { data: stampRow, error: stampError } = await supabase
    .from('stamps')
    .insert({
      user_id: userId,
      date: getTodayDate(),
      method: 'QR',
      created_at: stampCreatedAt,
    })
    .select('id')
    .single();

  if (stampError || !stampRow) throw stampError ?? new Error('스탬프 적립 실패');

  await insertStampHistory(supabase, userId, {
    stamp_id: stampRow.id,
    action: 'add',
    date: getTodayDate(),
    method: 'QR',
    message: 'QR 방식으로 스탬프 적립',
  });

  await supabase.from('profiles').update({ last_stamp_time: stampCreatedAt }).eq('id', userId);
  await logAction(supabase, userId, '스탬프 적립', 'QR 방식으로 1개 적립');

  const { count } = await supabase
    .from('stamps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 10) {
    await issueCoupon(supabase, userId);
    await clearStamps(supabase, userId);
    await sendPushToUser({
      uuid: userId,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: { screen: 'coupons', uuid: userId },
    });
  }
}

export async function processQrStamp(userId: string, qrData: string): Promise<void> {
  const valid = await validateQrCode(qrData);
  if (!valid) {
    const err = new Error('유효하지 않은 QR 코드입니다.');
    (err as Error & { code: string }).code = 'INVALID_QR';
    throw err;
  }

  await addStamp(userId);
}
