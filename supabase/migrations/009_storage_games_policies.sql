-- games Storage bucket 정책
-- 사전 조건: Dashboard → Storage → New bucket → 이름 "games", Public bucket ON

CREATE POLICY games_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'games');

CREATE POLICY games_auth_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'games');

CREATE POLICY games_auth_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'games');

CREATE POLICY games_auth_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'games');
