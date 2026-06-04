-- trip_guides Firebase 호환
ALTER TABLE trip_guides ADD COLUMN IF NOT EXISTS contact TEXT;

-- trip_reservations Firebase 호환 (출조 스냅샷 + updated_at)
ALTER TABLE trip_reservations ADD COLUMN IF NOT EXISTS trip_date DATE;
ALTER TABLE trip_reservations ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE trip_reservations ADD COLUMN IF NOT EXISTS departure_time TEXT;
ALTER TABLE trip_reservations ADD COLUMN IF NOT EXISTS return_time TEXT;
ALTER TABLE trip_reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 포인트몰 주문
CREATE TABLE IF NOT EXISTS point_mall_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES point_mall_products(id) ON DELETE SET NULL,
  product_name TEXT,
  point_used INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_mall_orders_user ON point_mall_orders(user_id);

ALTER TABLE point_mall_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY point_mall_orders_own ON point_mall_orders FOR ALL USING (
  auth.uid() = user_id OR public.is_admin()
);
