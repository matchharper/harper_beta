-- github_profile: GitHub 계정 생성일을 별도 필드로 저장
-- created_at은 row 생성 시점으로 DB default 사용
ALTER TABLE github_profile
  ADD COLUMN IF NOT EXISTS github_created_at TIMESTAMPTZ;

ALTER TABLE github_profile
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at DROP NOT NULL;

COMMENT ON COLUMN github_profile.github_created_at IS 'GitHub 계정 생성일 (API created_at)';

-- github_repo: repo 생성일을 repo_created_at으로改名
-- created_at은 row 생성 시점으로 DB default 사용
ALTER TABLE github_repo
  ADD COLUMN IF NOT EXISTS repo_created_at TIMESTAMPTZ;

ALTER TABLE github_repo
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at DROP NOT NULL;

COMMENT ON COLUMN github_repo.repo_created_at IS 'GitHub repo 생성일 (API createdAt)';

-- 과거 데이터 백필: github_profile
UPDATE github_profile
SET github_created_at = created_at
WHERE github_created_at IS NULL
  AND created_at IS NOT NULL;

-- 과거 데이터 백필: github_repo
UPDATE github_repo
SET repo_created_at = created_at
WHERE repo_created_at IS NULL
  AND created_at IS NOT NULL;

-- 과거 NULL 대체 (created_at DEFAULT 설정 전 삽입된 행)
UPDATE github_profile SET created_at = now() WHERE created_at IS NULL;
UPDATE github_repo SET created_at = now() WHERE created_at IS NULL;
