-- Row Level Security (MVP — 점진적 강화)

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fishing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_photo_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_sale_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_mall_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE points ENABLE ROW LEVEL SECURITY;
ALTER TABLE bait_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- admin/captain 헬퍼
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_captain_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('captain', 'admin')
  );
$$;

-- profiles
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- boarding_info
CREATE POLICY boarding_select_own ON boarding_info FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY boarding_upsert_own ON boarding_info FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- stamps / coupons / points (본인 + admin)
CREATE POLICY stamps_own ON stamps FOR ALL USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY stamp_history_own ON stamp_history FOR ALL USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY coupons_own ON coupons FOR ALL USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY points_own ON points FOR ALL USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY bait_usage_own ON bait_usage FOR ALL USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY user_logs_own ON user_action_logs FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- 공개 읽기 (커뮤니티/출조/몰)
CREATE POLICY trip_guides_read ON trip_guides FOR SELECT USING (true);
CREATE POLICY trip_guides_admin ON trip_guides FOR ALL USING (public.is_admin());

CREATE POLICY community_photos_read ON community_photos FOR SELECT USING (true);
CREATE POLICY community_photos_write ON community_photos FOR INSERT WITH CHECK (auth.uid() = uploaded_by OR public.is_admin());
CREATE POLICY community_photos_update ON community_photos FOR UPDATE USING (auth.uid() = uploaded_by OR public.is_admin());

CREATE POLICY comments_read ON comments FOR SELECT USING (true);
CREATE POLICY comments_write ON comments FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY games_read ON games FOR SELECT USING (true);
CREATE POLICY games_admin ON games FOR ALL USING (public.is_admin());

CREATE POLICY point_mall_read ON point_mall_products FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY point_mall_admin ON point_mall_products FOR ALL USING (public.is_admin());

CREATE POLICY direct_sale_products_read ON direct_sale_products FOR SELECT USING (status = 'active' OR public.is_captain_or_admin());
CREATE POLICY direct_sale_products_captain ON direct_sale_products FOR ALL USING (public.is_captain_or_admin());

CREATE POLICY partner_restaurants_read ON partner_restaurants FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY partner_restaurants_admin ON partner_restaurants FOR ALL USING (public.is_admin());

-- captain photos: 태깅된 승객도 조회
CREATE POLICY captain_photos_read ON captain_photos FOR SELECT USING (
  public.is_captain_or_admin()
  OR EXISTS (
    SELECT 1 FROM captain_photo_tags t
    WHERE t.photo_id = captain_photos.id AND t.user_id = auth.uid()
  )
);
CREATE POLICY captain_photos_write ON captain_photos FOR ALL USING (public.is_captain_or_admin());

CREATE POLICY captain_photo_tags_read ON captain_photo_tags FOR SELECT USING (
  auth.uid() = user_id OR public.is_captain_or_admin()
);
CREATE POLICY captain_photo_tags_write ON captain_photo_tags FOR ALL USING (public.is_captain_or_admin());

-- fishing / processing (captain)
CREATE POLICY fishing_logs_captain ON fishing_logs FOR ALL USING (public.is_captain_or_admin());
CREATE POLICY processing_logs_captain ON processing_logs FOR ALL USING (public.is_captain_or_admin());

-- orders
CREATE POLICY direct_sale_orders_buyer ON direct_sale_orders FOR SELECT USING (
  auth.uid() = buyer_id OR public.is_captain_or_admin()
);
CREATE POLICY direct_sale_orders_insert ON direct_sale_orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY direct_sale_orders_update ON direct_sale_orders FOR UPDATE USING (public.is_captain_or_admin());

CREATE POLICY restaurant_bookings_own ON restaurant_bookings FOR ALL USING (
  auth.uid() = user_id OR public.is_admin()
);

CREATE POLICY trip_reservations_own ON trip_reservations FOR ALL USING (
  auth.uid() = user_id OR public.is_admin()
);

CREATE POLICY site_settings_read ON site_settings FOR SELECT USING (true);
CREATE POLICY site_settings_admin ON site_settings FOR ALL USING (public.is_admin());

CREATE POLICY attendance_read ON attendance FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY attendance_admin ON attendance FOR ALL USING (public.is_admin());

CREATE POLICY qr_logs_admin ON qr_scan_activity_logs FOR ALL USING (public.is_admin());
CREATE POLICY qr_logs_own ON qr_scan_activity_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY social_posts_captain ON social_posts FOR ALL USING (public.is_captain_or_admin());

-- Storage buckets (Supabase Dashboard에서 photos, products, processing 생성 후 적용)
-- storage.objects 정책은 Dashboard Storage Policies에서 설정 권장
