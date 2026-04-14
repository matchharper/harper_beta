-- prompt_templates: 탤런트 온보딩 프롬프트 관리 (ops/prompt 페이지)
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  draft_content TEXT,
  required_sections TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id)
);

-- prompt_versions: publish 시마다 content 스냅샷
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES auth.users(id),
  UNIQUE(template_id, version_number)
);

-- prompt_test_flags: 계정별 draft 테스트 플래그
CREATE TABLE prompt_test_flags (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL REFERENCES prompt_templates(slug),
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_slug)
);

-- RLS: service role only (내부 API 전용)
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_test_flags ENABLE ROW LEVEL SECURITY;

-- 버전 이력 조회 인덱스
CREATE INDEX idx_prompt_versions_template ON prompt_versions(template_id, version_number DESC);
