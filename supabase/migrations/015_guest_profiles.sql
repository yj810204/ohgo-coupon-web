-- 승선명부 uuidv5 비회원 (auth.users FK 없음)
CREATE TABLE IF NOT EXISTS guest_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  phone TEXT,
  merged_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_profiles_merged_to
  ON guest_profiles(merged_to) WHERE merged_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS guest_boarding_info (
  guest_id TEXT PRIMARY KEY REFERENCES guest_profiles(id) ON DELETE CASCADE,
  name TEXT,
  birth TEXT,
  gender TEXT,
  phone TEXT,
  emergency TEXT,
  address TEXT,
  address_detail TEXT,
  agreed BOOLEAN NOT NULL DEFAULT false,
  agreed_third_party BOOLEAN NOT NULL DEFAULT false,
  trip_role TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_boarding_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY guest_profiles_captain_admin ON guest_profiles
  FOR ALL USING (public.is_captain_or_admin());

CREATE POLICY guest_boarding_captain_admin ON guest_boarding_info
  FOR ALL USING (public.is_captain_or_admin());
