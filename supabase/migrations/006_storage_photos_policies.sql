-- photos Storage bucket 정책
-- 사전 조건: Dashboard → Storage → New bucket → 이름 "photos", Public bucket ON

CREATE POLICY photos_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY photos_auth_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'photos');

CREATE POLICY photos_auth_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'photos');

CREATE POLICY photos_auth_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'photos');
