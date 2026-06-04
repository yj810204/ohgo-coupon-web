import { format } from 'date-fns';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { sendPushToUser } from './send-push';

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

async function logAction(userId: string, action: string, detail: string) {
  const supabase = getSupabaseBrowserClient();
  await supabase.from('user_action_logs').insert({ user_id: userId, action, detail });
}

async function insertStampHistory(
  userId: string,
  row: {
    stamp_id?: string | null;
    action: string;
    date?: string;
    method?: string;
    message?: string;
  }
) {
  const supabase = getSupabaseBrowserClient();
  await supabase.from('stamp_history').insert({
    user_id: userId,
    stamp_id: row.stamp_id ?? null,
    action: row.action,
    date: row.date,
    method: row.method,
    message: row.message,
  });
}

export async function getStampHistory({
  uuid,
  startDate,
  endDate,
}: {
  uuid: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from('stamp_history')
    .select('*')
    .eq('user_id', uuid)
    .order('created_at', { ascending: false });

  if (startDate) {
    q = q.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    q = q.lte('created_at', endDate.toISOString());
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    stampId: row.stamp_id,
    date: row.date,
    method: row.method,
    message: row.message,
    timestamp: row.created_at,
  }));
}

export async function clearStampHistory(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('stamp_history').delete().eq('user_id', uuid);
  if (error) throw error;
}

export async function issue50PercentCoupon(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id')
    .eq('user_id', uuid)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!stamps || stamps.length < 5) return;

  const toDelete = stamps.slice(0, 5);
  await supabase
    .from('stamps')
    .delete()
    .in(
      'id',
      toDelete.map((s) => s.id)
    );

  await supabase.from('coupons').insert({
    user_id: uuid,
    issued_at: getTodayDate(),
    reason: '5회 적립 50% 할인',
    used: false,
    is_half: true,
  });

  await logAction(uuid, '쿠폰 발급', '5회 적립 50% 할인 쿠폰 발급');
}

export async function addStamp(uuid: string, method: 'QR' | 'ADMIN' = 'QR'): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const now = Date.now();

  if (method === 'QR') {
    const { start, end } = getTodayRange();
    const { data: usedCoupons } = await supabase
      .from('coupons')
      .select('issued_at, used_at')
      .eq('user_id', uuid)
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
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_stamp_time')
    .eq('id', uuid)
    .maybeSingle();

  const lastStampTime = profile?.last_stamp_time
    ? new Date(profile.last_stamp_time).getTime()
    : 0;

  const LIMIT_MS = method === 'QR' ? 8 * 60 * 60 * 1000 : 1000;

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
      user_id: uuid,
      date: getTodayDate(),
      method,
      created_at: stampCreatedAt,
    })
    .select('id')
    .single();

  if (stampError || !stampRow) throw stampError ?? new Error('스탬프 적립 실패');

  await insertStampHistory(uuid, {
    stamp_id: stampRow.id,
    action: 'add',
    date: getTodayDate(),
    method,
    message: `${method} 방식으로 스탬프 적립`,
  });

  await supabase
    .from('profiles')
    .update({ last_stamp_time: stampCreatedAt })
    .eq('id', uuid);

  await logAction(uuid, '스탬프 적립', `${method} 방식으로 1개 적립`);

  const { count } = await supabase
    .from('stamps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uuid);

  if ((count ?? 0) >= 10) {
    await issueCoupon(uuid);
    await clearStamps(uuid);

    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: { screen: 'coupons', uuid },
    });
  }
}

export async function addStampBatch(uuid: string, count: number): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const now = new Date();
  const stampIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const createdAt = new Date(now.getTime() + i * 1000).toISOString();
    const { data: row, error } = await supabase
      .from('stamps')
      .insert({
        user_id: uuid,
        date: getTodayDate(),
        method: 'ADMIN',
        created_at: createdAt,
      })
      .select('id')
      .single();

    if (error || !row) throw error ?? new Error('스탬프 적립 실패');
    stampIds.push(row.id);

    await insertStampHistory(uuid, {
      stamp_id: row.id,
      action: 'add',
      date: getTodayDate(),
      method: 'ADMIN',
      message: 'ADMIN 방식으로 스탬프 적립',
    });
  }

  await supabase
    .from('profiles')
    .update({ last_stamp_time: new Date(now.getTime() + (count - 1) * 1000).toISOString() })
    .eq('id', uuid);

  await logAction(uuid, '스탬프 적립', `ADMIN 방식으로 ${count}개 적립`);

  const { data: allStamps, error } = await supabase
    .from('stamps')
    .select('id, date, method, created_at')
    .eq('user_id', uuid)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const stamps = [...(allStamps ?? [])];
  const fullCouponCount = Math.floor(stamps.length / 10);

  for (let i = 0; i < fullCouponCount; i++) {
    await issueCoupon(uuid);
    const toDelete = stamps.splice(0, 10);

    for (const s of toDelete) {
      await insertStampHistory(uuid, {
        stamp_id: s.id,
        action: 'remove',
        date: s.date ?? undefined,
        method: s.method ?? undefined,
        message: '쿠폰 발급으로 스탬프 삭제',
      });
    }

    await supabase
      .from('stamps')
      .delete()
      .in(
        'id',
        toDelete.map((s) => s.id)
      );
  }

  if (fullCouponCount > 0) {
    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: `스탬프 ${fullCouponCount * 10}개 적립! 쿠폰 ${fullCouponCount}개가 발급되었어요~!`,
      data: { screen: 'coupons', uuid },
    });
  }
}

export async function removeStampBatch(uuid: string, count: number): Promise<void> {
  if (count < 1) return;

  const supabase = getSupabaseBrowserClient();
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id, date, method')
    .eq('user_id', uuid)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!stamps || stamps.length < count) {
    throw new Error(`보유 스탬프(${stamps?.length ?? 0}개)보다 많이 회수할 수 없습니다.`);
  }

  const toRemove = stamps.slice(0, count);

  for (const s of toRemove) {
    await insertStampHistory(uuid, {
      stamp_id: s.id,
      action: 'recall',
      date: s.date ?? undefined,
      method: s.method ?? undefined,
      message: 'ADMIN 방식으로 스탬프 회수',
    });
  }

  await supabase
    .from('stamps')
    .delete()
    .in(
      'id',
      toRemove.map((s) => s.id)
    );

  await logAction(uuid, '스탬프 회수', `ADMIN 방식으로 ${count}개 회수`);

  await sendPushToUser({
    uuid,
    title: '스탬프가 회수되었습니다.',
    body: `스탬프 ${count}개가 관리자에 의해 회수되었습니다.`,
    data: { screen: 'stamp', uuid },
  });
}

export async function getStamps(uuid: string): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('stamps')
    .select('date, method, created_at')
    .eq('user_id', uuid)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const method = row.method || '알 수 없음';
    const ts = row.created_at ? new Date(row.created_at) : null;

    if (ts && !isNaN(ts.getTime())) {
      const ymd = format(ts, 'yy-MM-dd');
      const hms = format(ts, 'HH:mm:ss');
      return `${ymd}|${method}|${hms}`;
    }

    if (row.date) {
      return `${row.date}|${method}|00:00:00`;
    }

    return `-|${method}|-`;
  });
}

export async function issueCoupon(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.from('coupons').insert({
    user_id: uuid,
    issued_at: getTodayDate(),
    reason: '10회 적립 100% 할인',
    used: false,
    is_half: false,
  });

  await logAction(uuid, '쿠폰 발급', '10회 적립 100% 할인 쿠폰 발급');
}

export async function clearStamps(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id, date, method')
    .eq('user_id', uuid);

  if (error) throw error;

  for (const s of stamps ?? []) {
    await insertStampHistory(uuid, {
      stamp_id: s.id,
      action: 'remove',
      date: s.date ?? undefined,
      method: s.method ?? undefined,
      message: '쿠폰 발급으로 스탬프 삭제',
    });
  }

  await supabase.from('stamps').delete().eq('user_id', uuid);
  await logAction(uuid, '스탬프 초기화', '10개 스탬프 삭제');
}

export type CouponItem = {
  id: string;
  reason?: string;
  issuedAt?: string;
  used?: boolean;
  isHalf?: string;
  deleted?: boolean;
};

export async function getCoupons(uuid: string): Promise<CouponItem[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('id, reason, issued_at, used, is_half')
    .eq('user_id', uuid)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    reason: c.reason ?? undefined,
    issuedAt: c.issued_at ?? undefined,
    used: c.used,
    isHalf: c.is_half ? 'Y' : undefined,
  }));
}

export async function revokeCoupon(uuid: string, couponId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('coupons')
    .delete()
    .eq('id', couponId)
    .eq('user_id', uuid);

  if (error) throw error;
}

export async function getCouponCount(uuid: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from('coupons')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uuid)
    .eq('used', false);

  if (error) throw error;
  return count ?? 0;
}

export async function deleteUser(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.from('stamps').delete().eq('user_id', uuid);
  await supabase.from('coupons').delete().eq('user_id', uuid);
  await supabase.from('stamp_history').delete().eq('user_id', uuid);
  await supabase.from('user_action_logs').delete().eq('user_id', uuid);
  await supabase.from('profiles').delete().eq('id', uuid);
}

export async function useOneCoupon(uuid: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: coupons, error } = await supabase
    .from('coupons')
    .select('id, reason, is_half')
    .eq('user_id', uuid)
    .eq('used', false)
    .limit(1);

  if (error) throw error;
  if (!coupons?.length) throw new Error('사용 가능한 쿠폰이 없습니다.');

  const coupon = coupons[0];
  if (coupon.is_half) {
    throw new Error('즉시 쿠폰 사용 불가 (50% 쿠폰 보유)\n직접 쿠폰을 선택해주세요.');
  }

  await supabase.from('coupons').update({ used: true }).eq('id', coupon.id);
  await logAction(uuid, '쿠폰 사용', `자동 선택 쿠폰 사용: ${coupon.reason || '쿠폰'}`);
}

export async function useCouponById(uuid: string, couponId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('id, reason, used')
    .eq('id', couponId)
    .eq('user_id', uuid)
    .maybeSingle();

  if (error) throw error;
  if (!coupon) throw new Error('해당 쿠폰을 찾을 수 없습니다.');
  if (coupon.used) throw new Error('이미 사용된 쿠폰입니다.');

  await supabase
    .from('coupons')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', couponId);

  await logAction(uuid, '쿠폰 사용', `${coupon.reason || '쿠폰'} 사용됨`);
}

export async function deleteStamp(uuid: string, value: string, _p0: string, _p1: string) {
  const [date, method, time] = value.split('|');
  if (!date || !method || !time) {
    console.warn('❗ 잘못된 스탬프 문자열 형식:', value);
    return;
  }

  const parsed = new Date(`20${date}T${time}`);
  if (isNaN(parsed.getTime())) {
    console.warn('❗ timestamp 변환 실패:', date, time);
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id, method, created_at')
    .eq('user_id', uuid);

  if (error) throw error;

  for (const s of stamps ?? []) {
    const docTime = s.created_at ? new Date(s.created_at).getTime() : 0;
    const sameTime = docTime && Math.abs(docTime - parsed.getTime()) < 1000;

    if (s.method === method && sameTime) {
      await supabase.from('stamps').delete().eq('id', s.id);

      await insertStampHistory(uuid, {
        stamp_id: s.id,
        action: 'recall',
        date,
        method,
        message: `${date} ${time} ${method} 스탬프 관리자 회수`,
      });

      await sendPushToUser({
        uuid,
        title: '스탬프가 회수되었습니다.',
        body: `${date} ${time} 스탬프 1개가 관리자에 의해 회수되었습니다.`,
        data: { screen: 'stamp', uuid },
      });

      await logAction(uuid, '스탬프 회수', `${date} ${time} ${method} 방식`);
      return;
    }
  }

  console.warn('❌ 일치하는 스탬프 문서 없음:', value);
}
