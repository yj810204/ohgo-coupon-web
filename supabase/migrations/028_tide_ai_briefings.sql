-- 날짜별 AI 출조 브리핑. 생성은 외부 루틴, 웹앱은 저장·조회만 한다.

CREATE TABLE IF NOT EXISTS tide_ai_briefings (
  date DATE PRIMARY KEY,
  summary TEXT,
  rig TEXT,
  operation TEXT,
  markdown TEXT,
  species TEXT[],
  title TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tide_ai_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tide_ai_briefings_read ON tide_ai_briefings;
CREATE POLICY tide_ai_briefings_read ON tide_ai_briefings FOR SELECT USING (true);

DROP POLICY IF EXISTS tide_ai_briefings_admin ON tide_ai_briefings;
CREATE POLICY tide_ai_briefings_admin ON tide_ai_briefings FOR ALL USING (public.is_admin());
