-- community_photos / comments DELETE·UPDATE 정책 (삭제·댓글 수정 누락 보완)

CREATE POLICY community_photos_delete ON community_photos
  FOR DELETE
  USING (auth.uid() = uploaded_by OR public.is_admin());

CREATE POLICY comments_delete ON comments
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY comments_update ON comments
  FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());
