-- 밴드 Open API OAuth 토큰. 서비스 롤(서버)만 읽고 쓴다.
-- anon/authenticated 정책은 두지 않는다.

CREATE TABLE IF NOT EXISTS public.band_oauth_tokens (
  id TEXT PRIMARY KEY CHECK (id = 'operator'),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  user_key TEXT,
  expires_in INTEGER,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.band_oauth_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.band_oauth_tokens FROM PUBLIC, anon, authenticated;
