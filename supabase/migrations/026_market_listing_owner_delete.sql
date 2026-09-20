-- 판매자가 본인 판매글을 상태와 관계없이 삭제할 수 있게 한다.
-- 기존 정책은 pending/rejected만 허용해서 승인·판매완료·강제숨김 글은 삭제 불가였다.

DROP POLICY IF EXISTS market_owner_delete ON market_listings;

CREATE POLICY market_owner_delete ON market_listings FOR DELETE
  USING (seller_id = auth.uid());
