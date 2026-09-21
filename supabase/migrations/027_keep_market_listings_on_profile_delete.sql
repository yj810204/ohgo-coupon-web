-- 회원 탈퇴/삭제 시 중고장터 글은 남기고 판매자만 익명화한다.
-- 기존 seller_id ON DELETE CASCADE 는 판매글까지 지워 버리므로 SET NULL 로 바꾼다.

ALTER TABLE market_listings
  ALTER COLUMN seller_id DROP NOT NULL;

ALTER TABLE market_listings
  DROP CONSTRAINT IF EXISTS market_listings_seller_id_fkey;

ALTER TABLE market_listings
  ADD CONSTRAINT market_listings_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.enforce_market_listing_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- 탈퇴 익명화: 판매자 ID만 비울 수 있다.
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    IF NEW.seller_id IS NULL THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'seller_id cannot be changed';
    END IF;
  END IF;

  NEW.admin_condition_grade := OLD.admin_condition_grade;
  NEW.admin_note := OLD.admin_note;
  NEW.inspected_in_person := OLD.inspected_in_person;
  NEW.reject_reason := OLD.reject_reason;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'approved' AND NEW.status = 'sold' THEN
      NULL;
    ELSIF OLD.status IN ('rejected', 'pending') AND NEW.status = 'pending' THEN
      NEW.reject_reason := NULL;
    ELSE
      RAISE EXCEPTION 'market listing status change not allowed';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
