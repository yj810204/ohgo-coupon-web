-- 중고장터 (회원 등록 + 관리자 검수 승인)

CREATE TABLE IF NOT EXISTS market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'etc',
  price INT NOT NULL DEFAULT 0,
  condition_grade TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  contact_phone TEXT,
  trade_area TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'sold', 'hidden')),
  admin_condition_grade TEXT,
  admin_note TEXT,
  inspected_in_person BOOLEAN NOT NULL DEFAULT false,
  reject_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_listings_status_created_idx
  ON market_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS market_listings_seller_idx
  ON market_listings (seller_id, created_at DESC);

ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_read ON market_listings FOR SELECT
  USING (
    status IN ('approved', 'sold')
    OR seller_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY market_insert ON market_listings FOR INSERT
  WITH CHECK (seller_id = auth.uid() AND status = 'pending');

CREATE POLICY market_owner_update ON market_listings FOR UPDATE
  USING (seller_id = auth.uid() AND status IN ('pending', 'rejected', 'approved'))
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY market_owner_delete ON market_listings FOR DELETE
  USING (seller_id = auth.uid() AND status IN ('pending', 'rejected'));

CREATE POLICY market_admin_all ON market_listings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 비관리자가 승인 상태/검수 컬럼을 임의로 올리지 못하게 차단
CREATE OR REPLACE FUNCTION public.enforce_market_listing_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'seller_id cannot be changed';
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

DROP TRIGGER IF EXISTS trg_enforce_market_listing_owner_update ON market_listings;
CREATE TRIGGER trg_enforce_market_listing_owner_update
  BEFORE UPDATE ON market_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_market_listing_owner_update();

CREATE OR REPLACE FUNCTION public.increment_market_view_count(listing_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE market_listings
  SET view_count = view_count + 1
  WHERE id = listing_id AND status IN ('approved', 'sold');
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_market_view_count(UUID) TO authenticated;
