-- Firebase 스탬프/쿠폰 staging (profiles FK 회피 → 병합 시 live 반영)
-- 사전: 015_guest_profiles.sql

CREATE TABLE IF NOT EXISTS legacy_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_uuid TEXT NOT NULL,
  firestore_id TEXT NOT NULL,
  date TEXT,
  method TEXT NOT NULL DEFAULT 'QR',
  created_at TIMESTAMPTZ,
  applied_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legacy_uuid, firestore_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_stamps_legacy_uuid ON legacy_stamps(legacy_uuid);
CREATE INDEX IF NOT EXISTS idx_legacy_stamps_pending
  ON legacy_stamps(legacy_uuid) WHERE applied_profile_id IS NULL;

CREATE TABLE IF NOT EXISTS legacy_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_uuid TEXT NOT NULL,
  firestore_id TEXT NOT NULL,
  reason TEXT,
  is_half BOOLEAN NOT NULL DEFAULT false,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  issued_at TEXT,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ,
  applied_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legacy_uuid, firestore_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_coupons_legacy_uuid ON legacy_coupons(legacy_uuid);
CREATE INDEX IF NOT EXISTS idx_legacy_coupons_pending
  ON legacy_coupons(legacy_uuid) WHERE applied_profile_id IS NULL;

CREATE TABLE IF NOT EXISTS legacy_stamp_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_uuid TEXT NOT NULL,
  firestore_id TEXT NOT NULL,
  action TEXT NOT NULL,
  stamp_firestore_id TEXT,
  date TEXT,
  method TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  applied_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legacy_uuid, firestore_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_stamp_history_legacy_uuid ON legacy_stamp_history(legacy_uuid);
CREATE INDEX IF NOT EXISTS idx_legacy_stamp_history_pending
  ON legacy_stamp_history(legacy_uuid) WHERE applied_profile_id IS NULL;

ALTER TABLE legacy_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_stamp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY legacy_stamps_admin ON legacy_stamps
  FOR ALL USING (public.is_admin());
CREATE POLICY legacy_coupons_admin ON legacy_coupons
  FOR ALL USING (public.is_admin());
CREATE POLICY legacy_stamp_history_admin ON legacy_stamp_history
  FOR ALL USING (public.is_admin());
