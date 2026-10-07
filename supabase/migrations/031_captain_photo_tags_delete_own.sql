-- 태깅된 회원은 자기 조황 사진 목록에서 본인 태그를 지울 수 있다.
-- 선장 사진 원본은 captain_photos 에 남는다.

DROP POLICY IF EXISTS captain_photo_tags_delete_own ON captain_photo_tags;

CREATE POLICY captain_photo_tags_delete_own ON captain_photo_tags
  FOR DELETE
  USING (auth.uid() = user_id);
