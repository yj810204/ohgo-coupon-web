-- 게시글 작성자(또는 관리자)가 해당 글의 모든 댓글을 삭제할 수 있도록 허용
-- (기존 comments_delete는 본인 댓글만 삭제 가능 → 글 삭제 시 타인 댓글이 남는 문제)

CREATE POLICY comments_delete_by_photo_owner ON comments
  FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM community_photos p
      WHERE p.id = comments.photo_id
        AND p.uploaded_by = auth.uid()
    )
  );
