create extension if not exists pgcrypto;

create table if not exists public.official_jobs (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  role_title text not null,
  location text not null,
  vertical text not null,
  short_description text not null default '',
  company_description_markdown text not null default '',
  role_description_markdown text not null default '',
  compensation text null,
  employment_type text null,
  seniority text null,
  company_logo_url text null,
  company_website_url text null,
  slug text not null,
  display_order integer not null default 0,
  is_published boolean not null default false,
  published_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint official_jobs_required_text_check check (
    length(btrim(company_name)) > 0
    and length(btrim(role_title)) > 0
    and length(btrim(location)) > 0
    and length(btrim(vertical)) > 0
    and length(btrim(slug)) > 0
  ),
  constraint official_jobs_slug_format_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

alter table public.official_jobs
  drop column if exists harper_description_markdown;

create unique index if not exists official_jobs_slug_uidx
  on public.official_jobs (slug);

create index if not exists official_jobs_public_order_idx
  on public.official_jobs (
    is_published,
    display_order asc,
    published_at desc nulls last
  );

create index if not exists official_jobs_vertical_idx
  on public.official_jobs (vertical);

create or replace function public.set_official_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists official_jobs_set_updated_at
  on public.official_jobs;

create trigger official_jobs_set_updated_at
before update on public.official_jobs
for each row execute function public.set_official_jobs_updated_at();

alter table public.official_jobs enable row level security;

drop policy if exists official_jobs_public_select_published
  on public.official_jobs;

create policy official_jobs_public_select_published
  on public.official_jobs
  for select
  to anon, authenticated
  using (is_published = true);

grant select on public.official_jobs to anon, authenticated;

delete from public.official_jobs
where slug in ('stealth-ai-infra-founding-engineer', 'frontier-healthcare-ai-applied-ai-engineer', 'enterprise-automation-product-engineer');

insert into public.official_jobs (
  slug,
  company_name,
  role_title,
  location,
  vertical,
  short_description,
  company_description_markdown,
  role_description_markdown,
  compensation,
  employment_type,
  seniority,
  display_order,
  is_published,
  published_at
) values
(
  'top-tier-vc-backed-ai-legal-tech-ml-ai-engineer',
  'Top-tier VC-backed AI Legal Tech',
  'ML/AI Engineer',
  'New York',
  'Legal Tech',
  '글로벌 최상위 법무팀들이 사용하는 플랫폼의 핵심 AI 엔진을 구축할, 자기 주도적인 AI/ML 엔지니어를 모십니다.',
  $company1$본 고객사는 법률 및 지식재산권(IP) 산업을 근본적으로 혁신하고 있는 초고속 성장 AI 스타트업입니다. 최근 실리콘밸리 최상위 VC들로부터 4천만 달러(약 550억 원) 규모의 Series B 투자를 성공적으로 유치했으며, 엔터프라이즈급 생성형 AI 엔진을 빠르게 고도화하고 있습니다. 초기 발명 신고부터 대규모 소송에 이르기까지 복잡한 특허 워크플로우를 자동화하여, 글로벌 대기업들이 전례 없는 정확도로 자사의 아이디어를 보호하고 수익화할 수 있도록 지원합니다.$company1$,
  $role1$글로벌 최상위 법무팀들이 사용하는 플랫폼의 핵심 AI 엔진을 구축할, 자기 주도적인 AI/ML 엔지니어를 모십니다. 단순한 API 래퍼(Wrapper)를 만드는 것을 넘어, 고도의 기술 문서와 복잡한 IP 추론을 처리할 수 있는 정교한 멀티스텝 LLM 파이프라인을 설계하는 포지션입니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- 선행 기술 조사 및 침해 탐지와 같은 심층적인 IP 분석에 특화된 확장 가능한 AI/ML 알고리즘 및 LLM 파이프라인 설계 및 배포.
- 실제 법률 케이스에서 추출한 골든 데이터셋을 바탕으로, 모델의 성능을 엄격하게 측정하기 위한 평가 프레임워크(Evals) 구축.
- 방대하고 기술적인 법률/바이오 문서를 처리하기 위해 최적화된 고급 검색 아키텍처(벡터 데이터베이스, 하이브리드 BM25 검색) 구축.
- 특허 변호사 등 도메인 전문가와 협업하여 복잡한 리서치 업무를 수행하는 자율 에이전트(Agentic) 워크플로우 개발.
- 클라우드 환경(AWS, GCP)에서 비용, 지연 시간(Latency), 컨텍스트 윈도우, 모델 라우팅 등의 트레이드오프를 관리하며 프로덕션 수준의 추론(Inference) 최적화.

**Who you are**
- 단순한 프로토타입이나 토이 프로젝트가 아닌, 실제 유저들이 의존하는 프로덕션 레벨의 LLM 기반 기능을 배포하고 운영해 본 경험.
- 모델을 배포하기 전에 AI의 성능을 엄격하게 측정할 수 있는 환경을 먼저 구축하는 'Evals-first' 마인드셋.
- 주요 파운데이션 모델(Claude, GPT, Gemini)의 장단점에 대한 깊은 이해도와, 이를 언제 스위칭, 라우팅 또는 파인튜닝할지에 대한 탁월한 직관.
- API 설계 및 비동기 데이터 처리 등 탄탄한 백엔드 엔지니어링 감각을 갖춘 능숙한 Python 개발 역량.
- 난해한 법률 및 기술 용어를 두려워하지 않고, 복잡한 도메인 지식을 깊이 파고드는 지적 호기심과 끈기.

**Perks & benefits**
- 최고 수준의 급여 및 스톡옵션(Equity) 패키지
- 종합 건강, 치과, 안과 보험 전액 지원
- 유연한 근무 환경 및 글로벌 리모트(원격) 근무 지원
- 제한 없는 무제한 연차(Unlimited PTO) 및 멘탈 헬스케어 지원$role1$,
  null,
  'Full-time',
  null,
  10,
  true,
  timezone('utc', now())
),
(
  'top-tier-vc-backed-ai-legal-tech-senior-full-stack-engineer',
  'Top-tier VC-backed AI Legal Tech',
  'Senior Full Stack Engineer',
  'New York',
  'Legal Tech',
  '포춘 500대 기업의 법무팀이 사용하는 프로덕트의 엔드투엔드(End-to-end) 개발을 주도할 시니어 풀스택 엔지니어를 모십니다.',
  $company2$본 고객사는 법률 및 지식재산권(IP) 산업을 근본적으로 혁신하고 있는 초고속 성장 AI 스타트업입니다. 최근 실리콘밸리 최상위 VC들로부터 4천만 달러(약 550억 원) 규모의 Series B 투자를 성공적으로 유치했으며, 엔터프라이즈급 생성형 AI 엔진을 빠르게 고도화하고 있습니다. 초기 발명 신고부터 대규모 소송에 이르기까지 복잡한 특허 워크플로우를 자동화하여, 글로벌 대기업들이 전례 없는 정확도로 자사의 아이디어를 보호하고 수익화할 수 있도록 지원합니다.$company2$,
  $role2$포춘 500대 기업의 법무팀이 사용하는 프로덕트의 엔드투엔드(End-to-end) 개발을 주도할 시니어 풀스택 엔지니어를 모십니다. 고도화된 AI 추론 파이프라인과 매끄러운 사용자 경험을 연결하는 아키텍처를 설계하고 확장하며, 글로벌 기업들이 가장 가치 있는 자산을 관리하는 방식을 직접 혁신하게 됩니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- Python/FastAPI 백엔드, Next.js 프론트엔드 및 복잡한 AI 추론 파이프라인을 아우르는 모던 기술 스택을 기반으로 핵심 기능 개발 및 최적화.
- 매일 발생하는 방대한 양의 민감한 특허 분석 요청을 안정적으로 처리할 수 있는 확장성 높은 시스템 구축.
- 기술 부채를 선제적으로 파악 및 해결하고, 클라이언트 및 서버 사이드 성능 극대화.
- 프로덕트 매니저, 디자이너, AI 리서처와 긴밀하게 협업하여 복잡한 유저의 니즈를 결함 없는 디지털 경험으로 구현.
- 하이레벨 아키텍처 의사결정에 참여하고, 스택 전반에 걸쳐 발생하는 크리티컬한 프로덕션 이슈 해결.

**Who you are**
- 빠르게 변화하는 애자일 소프트웨어 환경에서 4년 이상의 탄탄한 풀스택 개발 경험.
- 모던 프론트엔드 생태계(TypeScript, Next.js 기반 React, TailwindCSS) 및 상태/데이터 관리(Zustand, Redux, TanStack query)에 대한 깊은 전문성.
- 프로덕션 환경에서의 강력한 Python 및 SQL 활용 능력.
- 아이디에이션부터 런칭까지, 세세한 지시 없이도 복잡한 프로젝트를 주도적으로 이끌 수 있는 탁월한 오너십.
- 불확실성이 높은 환경을 즐기며, 복잡한 기술적 한계를 비개발 직군도 이해할 수 있도록 명확하게 소통하는 커뮤니케이션 능력.$role2$,
  null,
  'Full-time',
  'Senior',
  20,
  true,
  timezone('utc', now())
),
(
  'sequoia-backed-consumer-ai-agent-software-engineer-infrastructure',
  'Sequoia-backed Consumer AI Agent',
  'Software Engineer Infrastructure',
  'San Francisco',
  'Consumer AI',
  '플랫폼의 속도, 안정성, 확장성을 책임질 핵심 인프라 엔지니어를 모십니다.',
  $company3$본 고객사는 실리콘밸리 최상위 VC(Sequoia Capital 등)의 투자를 받은 컨슈머 기반 AI Agent 스타트업입니다. 기존의 1:1 대화형 LLM의 한계를 뛰어넘어, 여러 사람 간의 복잡한 커뮤니케이션과 상호작용을 자율적으로 조율하고 실제 액션을 수행하는 세계 최초의 '멀티플레이어 상태 보존형(Stateful) AI'를 구축하고 있습니다. 유저가 연결될수록 기하급수적으로 강력해지는 네트워크 효과를 바탕으로, 글로벌 프로슈머 및 컨슈머 AI 시장의 새로운 표준을 만들어가고 있는 로켓십입니다.$company3$,
  $role3$플랫폼의 속도, 안정성, 확장성을 책임질 핵심 인프라 엔지니어를 모십니다. 수백만 건의 복잡한 네트워크 상호작용을 처리하는 AI 에이전트의 기반 시스템(LLM 게이트웨이 포함)을 아키텍팅하고, 폭발적인 트래픽 성장 속에서도 시스템의 Health를 완벽하게 유지하는 역할입니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- PostgreSQL, Clickhouse 및 비동기 데이터 처리 파이프라인 등 핵심 인프라의 설계, 운영 및 고도화.
- 안정성, 성능, 비용 효율성을 극대화하기 위한 LLM 게이트웨이, 평가 파이프라인 및 옵저버빌리티 스택 최적화.
- 트래픽 확장에 대비하여 Redis, Kafka 등의 시스템을 도입하고, 실용적인 Trade-offs를 고려한 신규 인프라 아키텍팅.
- 적절한 시점에 이슈를 선제적으로 파악할 수 있는 견고한 모니터링, 알림 및 대시보드 구축.

**Who you are**
- 4년 이상의 백엔드 또는 인프라스트럭처 엔지니어링 경험.
- 비효율성을 진단하고 병목 현상을 해결할 수 있는 데이터베이스 기술에 대한 깊고 실무적인 이해.
- 작업 대기열, 비동기 처리 또는 이벤트 기반 시스템 설계 및 운영 경험.
- 대규모 스케일링 문제를 겪고 이를 해결하여 시스템 안정성을 크게 향상시켜 본 경험. (Docker, AWS/GCP, IaC 환경 경험 우대)$role3$,
  null,
  'Full-time',
  null,
  30,
  true,
  timezone('utc', now())
),
(
  'sequoia-backed-consumer-ai-agent-ai-agent-engineer',
  'Sequoia-backed Consumer AI Agent',
  'AI Agent Engineer',
  'San Francisco',
  'Consumer AI',
  '프로덕션 환경에서 작동하는 자율 AI 에이전트의 핵심 지능을 설계하고 고도화할 AI 에이전트 엔지니어를 모십니다.',
  $company4$본 고객사는 실리콘밸리 최상위 VC(Sequoia Capital 등)의 투자를 받은 컨슈머 기반 AI Agent 스타트업입니다. 기존의 1:1 대화형 LLM의 한계를 뛰어넘어, 여러 사람 간의 복잡한 커뮤니케이션과 상호작용을 자율적으로 조율하고 실제 액션을 수행하는 세계 최초의 '멀티플레이어 상태 보존형(Stateful) AI'를 구축하고 있습니다. 유저가 연결될수록 기하급수적으로 강력해지는 네트워크 효과를 바탕으로, 글로벌 프로슈머 및 컨슈머 AI 시장의 새로운 표준을 만들어가고 있는 로켓십입니다.$company4$,
  $role4$프로덕션 환경에서 작동하는 자율 AI 에이전트의 핵심 지능을 설계하고 고도화할 AI 에이전트 엔지니어를 모십니다. 복잡한 제약 조건 속에서도 시스템이 완벽하게 작동하도록 Orchestrator와 서브 Sub-agents를 조율하는 역할입니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- 오케스트레이터 에이전트 및 특화된 서브 에이전트 아키텍처를 설계하고, 시스템 전반의 프롬프트를 정교하게 튜닝.
- 에이전트의 품질을 측정하고 Regression을 선제적으로 방지하기 위한 엄격한 Evals 프레임워크 구축 및 유지보수.
- 에이전트의 실패 사례(잘못된 컨텍스트 이해, 오판 등)를 딥다이브하여 디버깅하고 근본적인 아키텍처 개선.
- 파운데이션 모델의 발전과 유저 니즈의 확장에 발맞춰 새로운 에이전트 기능을 지속적으로 실험 및 통합.

**Who you are**
- 2년 이상의 프로덕션 소프트웨어 배포 및 오너십을 가진 엔지니어.
- 백엔드 엔지니어링에 대한 탄탄한 기본기를 바탕으로, 프로덕션 시스템에 LLM을 통합해 본 경험(또는 이 분야에 대한 압도적인 학습 능력).
- 단순한 프롬프트 엔지니어링을 넘어, AI 에이전트 아키텍처의 진화와 산업 동향에 대한 깊은 탐구심을 가진 분.
- 무엇이 잘 작동하고, 무엇이 문제인지 명확하고 구조적으로 설명할 수 있는 탁월한 커뮤니케이션 능력.$role4$,
  null,
  'Full-time',
  null,
  40,
  true,
  timezone('utc', now())
),
(
  'sequoia-backed-consumer-ai-agent-software-engineer-product-growth',
  'Sequoia-backed Consumer AI Agent',
  'Software Engineer Product & Growth',
  'San Francisco',
  'Consumer AI',
  'AI 에이전트의 한계를 넓히고 새로운 유저 경험을 창출할 프로덕트 엔지니어를 모십니다.',
  $company5$본 고객사는 실리콘밸리 최상위 VC(Sequoia Capital 등)의 투자를 받은 컨슈머 기반 AI Agent 스타트업입니다. 기존의 1:1 대화형 LLM의 한계를 뛰어넘어, 여러 사람 간의 복잡한 커뮤니케이션과 상호작용을 자율적으로 조율하고 실제 액션을 수행하는 세계 최초의 '멀티플레이어 상태 보존형(Stateful) AI'를 구축하고 있습니다. 유저가 연결될수록 기하급수적으로 강력해지는 네트워크 효과를 바탕으로, 글로벌 프로슈머 및 컨슈머 AI 시장의 새로운 표준을 만들어가고 있는 로켓십입니다.$company5$,
  $role5$AI 에이전트의 한계를 넓히고 새로운 유저 경험을 창출할 프로덕트 엔지니어를 모십니다. 프론트엔드, 백엔드, 에이전트 엔지니어링의 경계를 넘나들며, 새로운 접점(Slack, 이메일, 서드파티 툴 등)에 플랫폼을 통합하고 유저가 열광하는 기능을 엔드투엔드로 배포합니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- 백엔드, 프론트엔드, AI 에이전트 연동을 아우르는 신규 기능의 End-to-end 개발 및 배포.
- 에이전트가 처리할 수 있는 워크플로우를 무한히 확장하기 위한 새로운 툴 및 기능 추가.
- 외부 서비스(Slack, 이메일, 캘린더 등)와의 API 연동 및 통합 아키텍처 고도화.
- 빠른 프로토타이핑을 통해 가설을 검증하고, 작동하는 기능을 견고하게 다듬어내는 실용적 개발 이터레이션.

**Who you are**
- 2년 이상의 프로덕션 소프트웨어 배포 경험.
- 특정 스택에 얽매이지 않고, 문제를 해결하기 위해 프론트엔드와 백엔드를 자유롭게 넘나드는 풀스택 역량.
- 단순히 테스트 코드를 통과하는 것을 넘어 UX, 정확성, 프로덕트의 본질적 가치를 깊이 고민하는 날카로운 프로덕트 감각.
- 엔지니어, 디자이너, 유저 등 다양한 이해관계자와 명확하게 소통할 수 있는 커뮤니케이션 능력.$role5$,
  null,
  'Full-time',
  null,
  50,
  true,
  timezone('utc', now())
),
(
  'nvidia-a16z-backed-6b-frontier-ai-senior-staff-full-stack-engineer-applied-ai',
  'Nvidia & a16z-backed $6B Frontier AI',
  'Senior/Staff Full Stack Engineer (Applied AI)',
  'San Francisco / London / Seoul / Paris',
  'Frontier AI',
  'Senior/Staff Full Stack Engineer (Applied AI)는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company6$전 세계에서 OpenAI의 가장 강력하고 위협적인 대항마로 손꼽히는 유럽 최고의 파운데이션 모델 기업입니다. 설립 1년 남짓 만에 Nvidia, Microsoft, a16z 등 글로벌 탑티어 자본을 싹쓸이하며 기업가치 6조 원($6B)을 돌파하는 미친 성장 속도를 보여주고 있습니다. 매개변수 대비 압도적인 효율을 자랑하는 세계 최고 수준의 오픈 웨이트 및 상용 모델을 연달아 출시하며 글로벌 AI 생태계의 판도를 뒤집고 있습니다. 파리, 뉴욕, 싱가포르 등에 분산된 소수 정예의 천재적인 리서처 및 엔지니어들과 함께 생성형 AI의 한계를 직접 돌파할 탑티어 인재를 찾고 있습니다.$company6$,
  $role6$Senior/Staff Full Stack Engineer (Applied AI)는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**What you'll do**
- 파운데이션 모델을 클라이언트 환경에 매끄럽게 연동하는 확장 가능하고 견고한 풀스택 애플리케이션 설계 및 개발
- 프론트엔드와 백엔드 시스템 간의 통합을 주도하며 고객의 복잡한 비즈니스 유즈케이스를 프로덕션 레벨로 구현
- 사내 AI 리서처 및 프로덕트 엔지니어와 협력하여 고객 피드백을 자사 AI 모델 및 API 고도화에 직접 반영

**Who you are**
- 최신 기술 환경에서 5년 이상의 기술 IC(Individual Contributor) 경험
- Python 및 TypeScript에 대한 강력한 코딩 역량
- 모던 프론트엔드(React, NextJS 등) 및 백엔드(NodeJS) 프레임워크를 활용한 탄탄한 아키텍팅 경험
- 복잡한 기술적 개념을 비개발 직군 고객에게도 명확하게 설명할 수 있는 커뮤니케이션 능력

**Perks & benefits**
- 현지 오피스 합류를 위한 비자 스폰서십 및 릴로케이션 전폭 지원
- 글로벌 최고 수준의 급여 및 매력적인 지분 패키지
- 프리미엄 건강 보험 전액 지원
- 체력 단련비, 식대, 대중교통/주차비 등 생활 밀착형 웰니스 수당 매월 별도 지급$role6$,
  null,
  'Full-time',
  'Senior / Staff',
  60,
  true,
  timezone('utc', now())
),
(
  'a16z-lightspeed-backed-14b-frontier-ai-senior-staff-forward-deployed-ml-engineer',
  'a16z & Lightspeed-backed $14B Frontier AI',
  'Senior/Staff Forward Deployed ML Engineer',
  'San Francisco / London / Seoul / Paris',
  'Frontier AI',
  'Senior/Staff Forward Deployed ML Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company7$전 세계에서 OpenAI의 가장 강력하고 위협적인 대항마로 손꼽히는 유럽 최고의 파운데이션 모델 기업입니다. 설립 1년 남짓 만에 Nvidia, Microsoft, a16z 등 글로벌 탑티어 자본을 싹쓸이하며 기업가치 6조 원($6B)을 돌파하는 미친 성장 속도를 보여주고 있습니다. 매개변수 대비 압도적인 효율을 자랑하는 세계 최고 수준의 오픈 웨이트 및 상용 모델을 연달아 출시하며 글로벌 AI 생태계의 판도를 뒤집고 있습니다. 파리, 뉴욕, 싱가포르 등에 분산된 소수 정예의 천재적인 리서처 및 엔지니어들과 함께 생성형 AI의 한계를 직접 돌파할 탑티어 인재를 찾고 있습니다.$company7$,
  $role7$Senior/Staff Forward Deployed ML Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**What you'll do**
- 컨슈머 프로덕트부터 산업용 B2B 유즈케이스에 이르는 환경에서 최첨단 GenAI 애플리케이션 프로덕션 배포
- 고도화된 모델 Fine-tuning, 고급 RAG 및 자율 Agentic 기반의 복잡한 프로젝트 아키텍팅
- Pre-sales 단계부터 참여하여 기술적 가이드를 제공하고, 자사의 Inference 및 Fine-tuning 관련 오픈소스 코드베이스 기여

**Who you are**
- 7~10년 이상의 AI/머신러닝 기반 프로덕트 기술 IC 경험 (AI/데이터 사이언스 석박사 우대)
- 대규모 유저 베이스 프로덕트를 직접 구축하고 배포해 본 성공 경험
- LLM Fine-tuning, 고급 RAG 구축 및 복잡한 에이전트 문제 해결에 대한 깊은 실무 전문성
- 머신러닝 알고리즘 및 클라우드 인프라 배포에 대한 완벽한 이해도

**Perks & benefits**
- 현지 오피스 합류를 위한 비자 스폰서십 및 릴로케이션 전폭 지원
- 글로벌 최고 수준의 급여 및 매력적인 지분 패키지
- 프리미엄 건강 보험 전액 지원
- 체력 단련비, 식대, 대중교통/주차비 등 생활 밀착형 웰니스 수당 매월 별도 지급$role7$,
  null,
  'Full-time',
  'Senior / Staff',
  70,
  true,
  timezone('utc', now())
),
(
  'a16z-lightspeed-backed-14b-frontier-ai-forward-deployed-ml-engineer',
  'a16z & Lightspeed-backed $14B Frontier AI',
  'Forward Deployed ML Engineer',
  'San Francisco / London / Seoul / Paris',
  'Frontier AI',
  'Forward Deployed ML Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company8$전 세계에서 OpenAI의 가장 강력하고 위협적인 대항마로 손꼽히는 유럽 최고의 파운데이션 모델 기업입니다. 설립 1년 남짓 만에 Nvidia, Microsoft, a16z 등 글로벌 탑티어 자본을 싹쓸이하며 기업가치 6조 원($6B)을 돌파하는 미친 성장 속도를 보여주고 있습니다. 매개변수 대비 압도적인 효율을 자랑하는 세계 최고 수준의 오픈 웨이트 및 상용 모델을 연달아 출시하며 글로벌 AI 생태계의 판도를 뒤집고 있습니다. 파리, 뉴욕, 싱가포르 등에 분산된 소수 정예의 천재적인 리서처 및 엔지니어들과 함께 생성형 AI의 한계를 직접 돌파할 탑티어 인재를 찾고 있습니다.$company8$,
  $role8$Forward Deployed ML Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**What you'll do**
- 고객사의 프로덕트 및 API 온보딩을 책임지며 프롬프팅, Evals, Fine-tuning에 대한 기술적 가이드 제공
- 프론트엔드/백엔드 인터페이스와 파운데이션 모델 간의 최적화된 프로덕션 통합 지원
- 리서치 팀과 협력하여 복잡한 고객 과제를 해결하고 오픈소스 에코시스템 발전에 직접 기여

**Who you are**
- 2년 이상의 AI/ML 프로덕트 기반 IC 경험 (AI/데이터 사이언스 석박사 우대)
- PyTorch 기반 딥러닝 역량 및 Python 코딩 스킬
- Langchain 등 에이전트 프레임워크 및 벡터 데이터베이스 활용 경험
- LLM 및 NLP 애플리케이션 배포 실무 경험 및 API End-to-end 연동에 대한 탄탄한 이해도

**Perks & benefits**
- 현지 오피스 합류를 위한 비자 스폰서십 및 릴로케이션 전폭 지원
- 글로벌 최고 수준의 급여 및 매력적인 지분 패키지
- 프리미엄 건강 보험 전액 지원
- 체력 단련비, 식대, 대중교통/주차비 등 생활 밀착형 웰니스 수당 매월 별도 지급$role8$,
  null,
  'Full-time',
  null,
  80,
  true,
  timezone('utc', now())
),
(
  'insight-index-backed-2b-enterprise-ai-unicorn-cto',
  'Insight & Index-backed $2B Enterprise AI Unicorn',
  'CTO',
  'Seoul / Tokyo / Singapore / Bangkok',
  'B2B AI',
  'CTO는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company9$설립 단 13개월 만에 20억 달러(약 2조 7천억 원)의 기업 가치를 인정받으며 글로벌 AI 씬을 뒤흔들고 있는 초고속 성장 엔터프라이즈 AI 유니콘입니다. 1억 달러 규모의 Series A 유치 후 불과 4개월 만에 Insight Partners, Index Ventures, Bessemer Venture Partners 등 실리콘밸리 최상위 VC들로부터 1억 5천만 달러의 Series B 투자를 유치하며 누적 2억 8,600만 달러의 거대한 실탄을 확보했습니다.

현재 통신, 금융, 헬스케어 등 핵심 산업군의 복잡한 인프라에 완벽하게 통합되는 고객 서비스 AI 에이전트 플랫폼을 제공하며, 유럽과 아시아를 포함한 전 세계 30개국에서 폭발적인 수요를 입증하고 있습니다. 특히 진입 장벽이 높은 비영어권 시장의 언어, 문화, 규제 환경에 맞춘 완벽한 파인튜닝과 심층적인 시스템 인테그레이션을 위해 최고 수준의 현지 엔지니어링 팀을 직접 파견하는 독보적인 실행력을 자랑합니다. 글로벌 엔터프라이즈 AI 도입의 표준을 장악하기 위해 전체 팀 규모를 300명에서 900명으로 공격적으로 스케일업하고 있으며, 아시아 시장의 확장을 책임질 초기 핵심 멤버를 찾고 있습니다.$company9$,
  $role9$CTO는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- Korea: 한국 Base + 아시아 출장

**What you'll do**
- Pre-sales 단계의 기술적 리딩을 맡아 초기 대화 참여, 데모 시연, 아키텍처 및 보안 논의 주도
- 직접 코드를 작성하고 인테그레이션을 구축하며 높은 품질 기준을 세우는 Hands-on 엔지니어링 리드 역할 수행
- 엔지니어링, 인테그레이션, Pre-sales를 아우르는 고성능 테크 팀 빌딩 및 리딩
- AI 에이전트의 스코핑부터 프로덕션 배포까지 고객 인테그레이션 전 과정 주도
- 고객 피드백 수집 및 프로덕트 로컬라이제이션을 통해 한국 시장의 니즈를 글로벌 프로덕트 팀에 대변
- 로컬 기술 담당자로서 파트너십 구축 및 이슈 에스컬레이션 해결

**Who you are**
- 실제 프로덕션을 성공적으로 배포해 본 7~8년 이상의 Hands-on 소프트웨어 엔지니어링 경험
- Pre-sales, 솔루션 아키텍처 또는 복잡한 기술 인테그레이션에 대한 강력한 트랙 레코드
- Field CTO, Solutions Architect, Deployed Engineer 등 비즈니스와 기술 양쪽의 언어를 모두 유창하게 구사할 수 있는 역량
- Director, VP 혹은 창업자 수준의 강력한 리더십 DNA
- 능통한 영어 및 한국어 구사 능력과 함께, Zero-to-one 환경에서 팀과 시스템을 구축하는 불확실성 높은 환경을 즐기는 분

**Perks & benefits**
- 최고 수준의 급여 및 넥스트 유니콘 초기 멤버 스톡옵션 패키지
- 한국(Base) 근무 및 미국 본사 정기 교류 지원
- 유연한 원격 근무 및 글로벌 수준의 웰니스 복지 지원
- 엔터프라이즈 AI 도입의 최전선에서 시장을 개척하는 압도적인 스케일업 경험$role9$,
  null,
  'Full-time',
  'Executive',
  90,
  true,
  timezone('utc', now())
),
(
  'insight-index-backed-2b-enterprise-ai-unicorn-forward-deployed-engineer',
  'Insight & Index-backed $2B Enterprise AI Unicorn',
  'Forward Deployed Engineer',
  'Seoul / Tokyo / Singapore / Bangkok',
  'B2B AI',
  'Forward Deployed Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company10$설립 단 13개월 만에 20억 달러(약 2조 7천억 원)의 기업 가치를 인정받으며 글로벌 AI 씬을 뒤흔들고 있는 초고속 성장 엔터프라이즈 AI 유니콘입니다. 1억 달러 규모의 Series A 유치 후 불과 4개월 만에 Insight Partners, Index Ventures, Bessemer Venture Partners 등 실리콘밸리 최상위 VC들로부터 1억 5천만 달러의 Series B 투자를 유치하며 누적 2억 8,600만 달러의 거대한 실탄을 확보했습니다.

현재 통신, 금융, 헬스케어 등 핵심 산업군의 복잡한 인프라에 완벽하게 통합되는 고객 서비스 AI 에이전트 플랫폼을 제공하며, 유럽과 아시아를 포함한 전 세계 30개국에서 폭발적인 수요를 입증하고 있습니다. 특히 진입 장벽이 높은 비영어권 시장의 언어, 문화, 규제 환경에 맞춘 완벽한 파인튜닝과 심층적인 시스템 인테그레이션을 위해 최고 수준의 현지 엔지니어링 팀을 직접 파견하는 독보적인 실행력을 자랑합니다. 글로벌 엔터프라이즈 AI 도입의 표준을 장악하기 위해 전체 팀 규모를 300명에서 900명으로 공격적으로 스케일업하고 있으며, 아시아 시장의 확장을 책임질 초기 핵심 멤버를 찾고 있습니다.$company10$,
  $role10$Forward Deployed Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- Korea: 한국 Base + 아시아 출장

**What you'll do**
- 엔터프라이즈 고객과 직접 협력하여 크리티컬한 운영 과제와 성공 기준 파악
- 열린 형태의 문제를 명확한 기술 설계 및 구현으로 변환
- 고객 시스템과 연동되어 실제 작업을 수행하는 AI 에이전트 구축
- 문제 정의부터 시스템 설계, 런칭, Iteration에 이르는 프로젝트 End-to-end 오너십
- 안정성, 성능, 지속적인 개선을 포함한 프로덕션 배포 전 과정 주도

**Who you are**
- 3년 이상의 기술적 문제 해결 경험을 갖춘 Hands-on 제너럴리스트
- 세일즈 또는 프로덕트 팀과 협력하여 솔루션 스코핑, 디스커버리 워크숍, 초기 AI/기술 전략을 주도해 본 경험
- 소프트웨어 및 시스템 아키텍처 설계에 대한 탄탄한 기본기
- 완벽한 요구사항을 기다리기보다 방향성을 제안하고 의사결정을 주도하는 High-agency 마인드셋
- 다양한 시스템, 인테그레이션, 데이터 플로우를 넘나들며 작업해 본 경험

**Perks & benefits**
- 최고 수준의 급여 및 넥스트 유니콘 초기 멤버 스톡옵션 패키지
- 한국(Base) 근무 및 미국 본사 정기 교류 지원
- 유연한 원격 근무 및 글로벌 수준의 웰니스 복지 지원
- 엔터프라이즈 AI 도입의 최전선에서 시장을 개척하는 압도적인 스케일업 경험$role10$,
  null,
  'Full-time',
  null,
  100,
  true,
  timezone('utc', now())
),
(
  'nvidia-oracle-salesforce-backed-7b-enterprise-ai-member-of-technical-staff-mle',
  'Nvidia, Oracle & Salesforce-backed $7B Enterprise AI',
  'Member of Technical Staff (MLE)',
  'Seoul',
  'Frontier AI',
  'Member of Technical Staff (MLE)는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company11$자체적인 글로벌 최상위 파운데이션 모델을 직접 학습시키고 엔터프라이즈 환경에 배포하는 글로벌 AI 리딩 기업입니다. RAG, 시맨틱 검색, 자율 에이전트 등 프론티어 AI 기술을 통해 글로벌 대기업들의 인프라를 혁신하고 있습니다. 특히 데이터 보안이 필수적인 금융, 헬스케어, 통신 산업의 탑티어 고객사들을 위해 온프레미스 및 프라이빗 클라우드 환경에 최적화된 독자적인 AI 워크스페이스 플랫폼을 제공합니다. 뉴욕, 샌프란시스코, 토론토, 런던, 파리 등 글로벌 거점을 두고 있으며 전 세계 최고 수준의 AI 리서처 및 엔지니어들과 함께 일할 수 있는 엘리트 조직입니다.$company11$,
  $role11$Member of Technical Staff (MLE)는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- Korea: 한국 Base + 미국 /캐나다 Relocation 옵션

**What you'll do**
- 고객과 직접 대면하여 가장 크리티컬한 비즈니스 문제를 파악하고 LLM을 활용한 최적의 머신러닝 솔루션 설계 및 구현
- 엔터프라이즈 AI 도입의 가장 어려운 단계인 '라스트 마일'을 창의적이고 기술적인 문제 해결 능력으로 돌파
- 초기 스타트업의 CTO나 CEO처럼 주도적인 오너십을 가지고 프로덕트를 런칭하며 글로벌 핵심 산업 혁신 주도

**Who you are**
- 머신러닝, AI, 딥러닝 기술에 대한 탄탄한 전문성 및 LLM 실무 활용 경험
- 주어진 요구사항을 구현하는 것을 넘어 비즈니스 임팩트를 역으로 제안할 수 있는 창업가 마인드셋
- 모델 성능 최적화부터 실제 프로덕트 적용까지 폭넓은 기술 스택을 다룰 수 있는 제너럴리스트
- 고객의 피드백을 빠르게 흡수하고 솔루션을 반복 개선할 수 있는 애자일한 실행력

**Perks & benefits**
- 글로벌 거점(뉴욕, 샌프란시스코, 런던, 파리, 토론토) 리모트 유연 근무 및 코워킹 스페이스 비용 지원
- 업계 최고 수준의 의료, 치과 보험 및 별도의 멘탈 헬스케어 예산 지원
- 연간 6주(영업일 기준 30일)의 파격적인 유급 휴가 및 최대 6개월의 100% 유급 부모 휴가
- 자기 계발, 피트니스, 문화생활 및 업무 환경 개선을 위한 폭넓은 개인 지원금 지급
- 식대 지원 및 최고 수준의 글로벌 AI 리서처들과 함께하는 개방적이고 포용적인 환경$role11$,
  null,
  'Full-time',
  'Senior / Staff',
  110,
  true,
  timezone('utc', now())
),
(
  'nvidia-oracle-salesforce-backed-7b-enterprise-ai-forward-deployed-engineer',
  'Nvidia, Oracle & Salesforce-backed $7B Enterprise AI',
  'Forward Deployed Engineer',
  'Seoul',
  'Frontier AI',
  'Forward Deployed Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company12$자체적인 글로벌 최상위 파운데이션 모델을 직접 학습시키고 엔터프라이즈 환경에 배포하는 글로벌 AI 리딩 기업입니다. RAG, 시맨틱 검색, 자율 에이전트 등 프론티어 AI 기술을 통해 글로벌 대기업들의 인프라를 혁신하고 있습니다. 특히 데이터 보안이 필수적인 금융, 헬스케어, 통신 산업의 탑티어 고객사들을 위해 온프레미스 및 프라이빗 클라우드 환경에 최적화된 독자적인 AI 워크스페이스 플랫폼을 제공합니다. 뉴욕, 샌프란시스코, 토론토, 런던, 파리 등 글로벌 거점을 두고 있으며 전 세계 최고 수준의 AI 리서처 및 엔지니어들과 함께 일할 수 있는 엘리트 조직입니다.$company12$,
  $role12$Forward Deployed Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- Korea: 한국 Base + 미국 /캐나다 Relocation 옵션

**What you'll do**
- 프라이빗 클라우드 및 온프레미스 환경에서 자사의 엔터프라이즈 AI 플랫폼의 기획, 구성, 테스트 및 런칭을 포함한 End-to-end 배포 주도
- 글로벌 엔터프라이즈 IT 팀과 협력하여 인프라, 보안 요구사항 및 데이터 관리 프랙티스 평가
- 데이터 프라이버시 및 보안 규정을 완벽하게 준수하면서 고객 니즈에 맞춘 맞춤형 인프라 배포 전략 설계
- 배포 과정에서 발생하는 기술적 이슈를 트러블슈팅하고 다운타임을 최소화하는 즉각적인 솔루션 제공
- 높은 퀄리티와 빠른 속도로 이터레이션을 돌며 고객의 기대치를 뛰어넘는 프로덕션 환경 구축 (20~40%의 글로벌 출장 포함)

**Who you are**
- 복잡한 엔터프라이즈 인프라 및 온프레미스/프라이빗 클라우드 환경 배포를 주도해 본 인프라스트럭처 엔지니어
- 고객사 IT 및 보안 팀과 직접 소통하며 까다로운 인프라 요구사항을 조율할 수 있는 강력한 커뮤니케이션 역량
- 보안, 데이터 프라이버시, 규제 컴플라이언스(금융, 헬스케어 등)에 대한 깊은 실무 이해도
- 빠르게 움직이는 환경에서 주도적으로 문제를 해결하고 고객 중심의 사고를 할 수 있는 분

**Perks & benefits**
- 글로벌 거점(뉴욕, 샌프란시스코, 런던, 파리, 토론토) 리모트 유연 근무 및 코워킹 스페이스 비용 지원
- 업계 최고 수준의 의료, 치과 보험 및 별도의 멘탈 헬스케어 예산 지원
- 연간 6주(영업일 기준 30일)의 파격적인 유급 휴가 및 최대 6개월의 100% 유급 부모 휴가
- 자기 계발, 피트니스, 문화생활 및 업무 환경 개선을 위한 폭넓은 개인 지원금 지급
- 식대 지원 및 최고 수준의 글로벌 AI 리서처들과 함께하는 개방적이고 포용적인 환경$role12$,
  null,
  'Full-time',
  null,
  120,
  true,
  timezone('utc', now())
),
(
  'nvidia-oracle-salesforce-backed-7b-enterprise-ai-applied-ai-engineer',
  'Nvidia, Oracle & Salesforce-backed $7B Enterprise AI',
  'Applied AI Engineer',
  'Seoul',
  'Frontier AI',
  'Applied AI Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company13$자체적인 글로벌 최상위 파운데이션 모델을 직접 학습시키고 엔터프라이즈 환경에 배포하는 글로벌 AI 리딩 기업입니다. RAG, 시맨틱 검색, 자율 에이전트 등 프론티어 AI 기술을 통해 글로벌 대기업들의 인프라를 혁신하고 있습니다. 특히 데이터 보안이 필수적인 금융, 헬스케어, 통신 산업의 탑티어 고객사들을 위해 온프레미스 및 프라이빗 클라우드 환경에 최적화된 독자적인 AI 워크스페이스 플랫폼을 제공합니다. 뉴욕, 샌프란시스코, 토론토, 런던, 파리 등 글로벌 거점을 두고 있으며 전 세계 최고 수준의 AI 리서처 및 엔지니어들과 함께 일할 수 있는 엘리트 조직입니다.$company13$,
  $role13$Applied AI Engineer는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- Korea: 한국 Base + 미국 /캐나다 Relocation 옵션

**What you'll do**
- 초기 프로토타입부터 프로덕션 레벨의 자율 AI 에이전트까지, LLM 기반의 Agentic 워크플로우 직접 설계, 개발 및 배포
- LLM을 외부 툴, API, 데이터 소스와 통합하여 세상에 없던 혁신적인 엔터프라이즈 에이전트 워크플로우 구축
- 고객, 프로덕트, 플랫폼 팀과 긴밀하게 협업하여 대규모 Agentic 시스템의 아키텍처를 설계하고 Evals 및 배포 파이프라인 구축
- 안정성, Observability, 안전성 및 감사 가능성(Auditability)을 완벽하게 갖춘 엔터프라이즈 기준의 에이전트 시스템 런칭

**Who you are**
- 강력한 소프트웨어 엔지니어링 기본기와 프로덕션 레벨의 LLM 애플리케이션 아키텍팅 경험
- 단순한 프롬프트 엔지니어링을 넘어 에이전트 프레임워크 및 Tool use 최적화에 대한 깊은 이해
- 초기 아이디에이션부터 설계, 런칭까지 프로젝트 전 과정을 주도할 수 있는 탁월한 오너십
- 복잡한 비즈니스 문제를 기술적 솔루션으로 변환하고 고객과 직접 기술적인 딥다이브가 가능한 역량

**Perks & benefits**
- 글로벌 거점(뉴욕, 샌프란시스코, 런던, 파리, 토론토) 리모트 유연 근무 및 코워킹 스페이스 비용 지원
- 업계 최고 수준의 의료, 치과 보험 및 별도의 멘탈 헬스케어 예산 지원
- 연간 6주(영업일 기준 30일)의 파격적인 유급 휴가 및 최대 6개월의 100% 유급 부모 휴가
- 자기 계발, 피트니스, 문화생활 및 업무 환경 개선을 위한 폭넓은 개인 지원금 지급
- 식대 지원 및 최고 수준의 글로벌 AI 리서처들과 함께하는 개방적이고 포용적인 환경$role13$,
  null,
  'Full-time',
  null,
  130,
  true,
  timezone('utc', now())
),
(
  'premier-vc-backed-ny-k-foodtech-pre-series-a-operations-lead',
  'Premier VC-backed NY K-Foodtech (Pre-series A)',
  'Operations Lead',
  'New York',
  'Food Tech',
  'Operations Lead는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다.',
  $company14$뉴욕 맨해튼을 기반으로 글로벌 한식의 새로운 표준인 'Chipotle of Korean Eats'를 지향하며 공격적으로 확장 중인 패스트 캐주얼 브랜드입니다. a16z 파트너, 스마일게이트 인베스트먼트 등 최상위 투자자들 및 저명한 억만장자 기업가들로부터 누적 약 100억 원 규모의 투자를 성공적으로 유치했습니다. Noom과 Raddish 창업자가 보드 멤버로 참여하고 있으며, 압도적인 속도로 미국 전역 확장을 준비하고 있습니다.$company14$,
  $role14$Operations Lead는 고객과 제품의 가장 중요한 문제를 직접 풀어내는 역할입니다. 초기 정보가 제한된 confidential opportunity인 만큼, Harper가 후보자의 경험과 선호에 맞춰 구체적인 핏을 함께 확인합니다.

**Work arrangement**
- US: 비자/이주 전액 지원

**What you'll do**
- 뉴욕 내 여러 매장의 그라운드 레벨 실행 및 전략적 스케일링 주도
- 서플라이 체인 물류, 재고 관리 및 매장 단위의 Unit economics 최적화
- 타 도시 및 주로 브랜드를 확장할 때 즉각 도입할 수 있는 확장 가능하고 반복 가능한 운영 플레이북 개발
- 초고속으로 성장하는 F&B 스타트업의 역동적인 환경에서 운영의 복잡성을 해결하고 시스템화

**Who you are**
- 속도감 있는 스타트업 환경을 즐기고 직접 발로 뛰는 Hands-on 오퍼레이터
- P&L 관리, 서플라이 체인 및 운영 효율성에 대한 깊은 이해도와 탄탄한 분석력
- 크로스펑셔널 팀과 외부 벤더를 매끄럽게 조율할 수 있는 탁월한 리더십
- 푸드테크에 대한 열정과 피지컬 오퍼레이션을 국가적 규모로 확장해 보고 싶은 분

**Perks & benefits**
- 미국 현지 릴로케이션을 위한 전폭적인 비자 스폰서십
- 경쟁력 있는 급여 및 스톡옵션 패키지
- 미국 최고 수준의 종합 건강, 치과, 안과 보험 전액 지원
- 글로벌 브랜드 초기 확장을 함께하는 압도적인 커리어 성장 기회$role14$,
  null,
  'Full-time',
  'Lead',
  140,
  true,
  timezone('utc', now())
)
on conflict (slug) do update set
  company_name = excluded.company_name,
  role_title = excluded.role_title,
  location = excluded.location,
  vertical = excluded.vertical,
  short_description = excluded.short_description,
  company_description_markdown = excluded.company_description_markdown,
  role_description_markdown = excluded.role_description_markdown,
  compensation = excluded.compensation,
  employment_type = excluded.employment_type,
  seniority = excluded.seniority,
  display_order = excluded.display_order,
  is_published = excluded.is_published,
  published_at = excluded.published_at,
  updated_at = timezone('utc', now());
