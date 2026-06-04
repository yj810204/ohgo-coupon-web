-- profiles: 본인 프로필 INSERT 허용 (OAuth upsert fallback)
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);
