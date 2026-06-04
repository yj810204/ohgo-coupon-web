-- 승선명부/출항 확장
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS trip_number INT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS locations TEXT[];
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS arrival_time TEXT;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trip_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS confirmed_trips (
  date DATE NOT NULL,
  trip_number INT NOT NULL CHECK (trip_number BETWEEN 1 AND 3),
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  roster_image_path TEXT,
  roster_image_url TEXT,
  PRIMARY KEY (date, trip_number)
);

ALTER TABLE confirmed_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_admin ON attendance;
CREATE POLICY attendance_captain_admin ON attendance FOR ALL USING (public.is_captain_or_admin());

CREATE POLICY confirmed_trips_captain_admin ON confirmed_trips FOR ALL USING (public.is_captain_or_admin());

-- rosters Storage bucket (Dashboard에서 Public bucket 'rosters' 생성 후 실행)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rosters', 'rosters', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY rosters_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'rosters');

CREATE POLICY rosters_captain_upload ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'rosters' AND public.is_captain_or_admin()
  );

CREATE POLICY rosters_captain_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'rosters' AND public.is_captain_or_admin()
  );

CREATE POLICY rosters_captain_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'rosters' AND public.is_captain_or_admin()
  );
