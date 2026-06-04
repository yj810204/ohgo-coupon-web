-- DB 레벨 안전장치 (Cloud Functions 대체)

-- bait_coupons 음수 방지
CREATE OR REPLACE FUNCTION public.enforce_bait_coupon_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.bait_coupons < 0 THEN
    NEW.bait_coupons := 0;
    INSERT INTO bait_usage (user_id, date, used)
    VALUES (NEW.id, CURRENT_DATE, 10)
    ON CONFLICT (user_id, date) DO UPDATE SET used = 10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bait_coupon ON profiles;
CREATE TRIGGER trg_enforce_bait_coupon
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.bait_coupons < OLD.bait_coupons)
  EXECUTE FUNCTION public.enforce_bait_coupon_policy();

-- bait_usage 일일 한도 20
CREATE OR REPLACE FUNCTION public.enforce_bait_usage_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.used > 20 THEN
    RAISE EXCEPTION 'bait_usage daily limit exceeded (max 20)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bait_usage_limit ON bait_usage;
CREATE TRIGGER trg_enforce_bait_usage_limit
  BEFORE INSERT OR UPDATE ON bait_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bait_usage_limit();
