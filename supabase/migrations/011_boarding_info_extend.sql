-- boarding_info Firebase 호환 필드
ALTER TABLE boarding_info ADD COLUMN IF NOT EXISTS emergency TEXT;
ALTER TABLE boarding_info ADD COLUMN IF NOT EXISTS agreed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boarding_info ADD COLUMN IF NOT EXISTS agreed_third_party BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boarding_info ADD COLUMN IF NOT EXISTS trip_role TEXT;
