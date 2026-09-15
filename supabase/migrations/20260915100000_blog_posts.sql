-- Blog content is stored in one row per article. Korean and English versions
-- intentionally share publishing, imagery, and related-content configuration.
begin;

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_ko text,
  category_en text,
  title_ko text,
  title_en text,
  excerpt_ko text,
  excerpt_en text,
  content_ko text,
  content_en text,
  seo_title_ko text,
  seo_title_en text,
  seo_description_ko text,
  seo_description_en text,
  author_name text not null default 'Harper',
  author_avatar_url text not null default '/images/logo.png',
  thumbnail_url text not null,
  published_at date not null default current_date,
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  tags text[] not null default array[]::text[],
  schema_type text not null default 'article',
  related_job_slugs text[] not null default array[]::text[],
  related_post_slugs text[] not null default array[]::text[],
  created_by text,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint blog_posts_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint blog_posts_required_text_check
    check (
      btrim(author_name) <> ''
      and btrim(author_avatar_url) <> ''
      and btrim(thumbnail_url) <> ''
    ),
  constraint blog_posts_schema_type_check
    check (schema_type in ('article', 'faq', 'none')),
  constraint blog_posts_korean_version_check
    check (num_nonnulls(category_ko, title_ko, excerpt_ko, content_ko) in (0, 4)),
  constraint blog_posts_english_version_check
    check (num_nonnulls(category_en, title_en, excerpt_en, content_en) in (0, 4)),
  constraint blog_posts_published_version_check
    check (not is_published or content_ko is not null or content_en is not null),
  constraint blog_posts_related_jobs_limit_check
    check (cardinality(related_job_slugs) <= 4),
  constraint blog_posts_related_posts_limit_check
    check (cardinality(related_post_slugs) <= 3)
);

create index if not exists blog_posts_public_order_idx
  on public.blog_posts (is_published, is_pinned desc, published_at desc);

alter table public.blog_posts enable row level security;

revoke all on table public.blog_posts from anon, authenticated;
grant select on table public.blog_posts to anon, authenticated;
grant select, insert, update on table public.blog_posts to service_role;

drop policy if exists "Published blog posts are publicly readable"
  on public.blog_posts;
create policy "Published blog posts are publicly readable"
  on public.blog_posts
  for select
  to anon, authenticated
  using (is_published = true);

insert into public.blog_posts (
  slug,
  category_ko,
  category_en,
  title_ko,
  title_en,
  excerpt_ko,
  excerpt_en,
  content_ko,
  content_en,
  seo_title_ko,
  seo_title_en,
  seo_description_ko,
  seo_description_en,
  author_name,
  author_avatar_url,
  thumbnail_url,
  published_at,
  is_published,
  is_pinned,
  tags,
  schema_type,
  related_job_slugs,
  related_post_slugs,
  created_by,
  updated_by
)
values
(
    '2026-02-18-best-markdown-note-taking-apps-2026',
    '비교', null,
    '헤드헌팅 수수료가 부담스러운 스타트업들이 선택가능한 대안', null,
    '헤드헌팅 수수료가 부담스러운 스타트업들이 선택할 수 있는 현실적인 대안들을 소개합니다.', null,
    $blog_0$# Intro

2026년 기준, 좋은 후보자와 연결되기 위한 헤드헌터 수수료는  
연봉의 20~30% 수준입니다.

연봉 1억이면 2~3천입니다.  

물론 아깝다고 말하긴 어렵습니다.  
스타트업에서는 좋은 사람 한 명이 팀을 바꾸니까요.  
하지만 런웨이가 중요한 스타트업에게 이 금액은 분명 부담입니다.

게다가 가장 중요한 역할을 외부에 맡기다 보니,  
팀의 맥락과 빠르게 변하는 상황을 계속 공유해야 합니다.

그래서 당장 필요한 인력은 많지만  
결국 특정 포지션만 맡기게 됩니다.

&nbsp;

그래서 우리는 [Harper](https://matchharper.com)를 만들었습니다.

저희 서비스를 소개하고,  
아래에는 다른 대안들도 정리해보았습니다.

---

# 1. Harper, AI Recruiter

Harper는 두 가지 기능을 제공합니다.

## a. Talent Search

![Talent Search screen](/images/blog/screen.png)

좋은 Founder들은 직접 사람을 찾습니다.

트위터에서 꾸준히 작업물을 올리는 디자이너에게 DM을 보내고,  
일부러 오픈소스로 공개한 뒤 PR을 올린 개발자에게 연락합니다.

Harper는 그 과정을 자동화합니다.

자연어로 설명하면 됩니다.  
- “경력 5년 이하의 Rust 오픈소스 기여 엔지니어”
- “최근 6개월 내 투자받은 AI 스타트업 Founder”
- “일본 문화를 이해하는 한국인 SNS 마케터”

조건을 모두 만족하는 사람만 찾아드립니다.

검색 시간을 줄이고,  
실제 대화에 더 집중할 수 있게.

## b. AI Recruiting

조건이 명확하지 않을 때도 많습니다.  
“지금 팀 상황에서, 이런 문제를 풀 사람.”  
이럴 때는 AI와 대화하세요.

Harper는 팀의 맥락을 이해하고  
하루 1~2명씩 정말 적합한 후보자만 제안합니다.

기존 헤드헌팅과 비슷하지만,

- 더 저렴하고
- 더 빠르고 정확하며
- 무료로 먼저 써볼 수 있습니다

채용과 관련해 추가로 도움이 필요하신 분들은  
언제든지 문의해주세요.

내부 데이터베이스를 기반으로  
최적의 인재를 연결해드립니다.

[[사용하러 가기]](https://matchharper.com)

---

# 다른 대안들

# 2. 내부 추천 (Referral)

스타트업에게 가장 효율적인 방법은 여전히 내부 추천입니다.

내부 인원에게 수수료를 제공하더라도  
헤드헌팅 업체에 비용을 지불하는 것보다는 합리적입니다.

### 장점

- 비용이 낮다
- 문화 적합도가 높을 확률
- 레퍼런스 체크가 쉽다

### 단점

- 네트워크 범위가 제한적
- 반복 채용 시 후보 풀이 빠르게 소진됨

---

# 3. 직접 소싱

대표나 팀 리드가 직접 LinkedIn, SNS/커뮤니티, 오픈소스 기여 내역 등을 보며 연락하는 방식입니다.  
Meta CEO 마크 주커버그가   AI Talent 목록을 직접 만들고 관리한다는 이야기도 있습니다.

그만큼 좋은 인재를 모으고 싶다면  
선택 가능한 방법입니다.

**대표 서비스**  
[LinkedIn](https://www.linkedin.com), [GitHub](https://github.com), [X (Twitter)](https://x.com)

### 장점

- 원하는 조건으로 직접 탐색 가능
- 채용 시장에 나와 있지 않은 인재 접근 가능

### 단점

- 시간과 에너지 소모가 큼
- 응답률 관리가 필요함

---

# 4. 채용 플랫폼 활용

**대표 서비스**  
[원티드](https://www.wanted.co.kr), [잡코리아](https://www.jobkorea.co.kr)

### 장점

- 구조가 단순하고 익숙함
- 회사에 관심 있는 지원자를 모집 가능

### 단점

- 우수 인재가 지원하지 않을 가능성 → 팀 브랜딩 필요
- 많은 이력서로 인한 판별의 어려움

최근에는 이력서 판별을 도와주거나,  
팀 브랜딩을 지원하는 서비스도 늘어나고 있습니다.

---

# 마무리

결국 선택은 두 가지입니다.

돈을 쓰거나,  
시간을 쓰거나.

스타트업에게 둘 다 무겁습니다.

그래서 우리는,

**시간과 비용을 동시에 줄일 수 있는 방법을 만들고 싶었습니다.**

Harper는 그 시도입니다.$blog_0$, null,
    '헤드헌팅 수수료가 부담스러운 스타트업들이 선택가능한 대안', null,
    '헤드헌팅 수수료가 부담스러운 스타트업들이 선택할 수 있는 현실적인 대안들을 소개합니다.', null,
    '김호진',
    '/images/profiles/avatar4.png',
    '/images/dark1.png',
    '2026-02-25'::date,
    true,
    true,
    array['recruiting', 'startup']::text[],
    'article',
    array[]::text[],
    array['forward-deployed-engineer', 'deployment-strategist', 'field-cto-site-cto']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'forward-deployed-engineer',
    'Roles', null,
    'Forward Deployed Engineer(FDE) 하는 일과 한국 채용 | Harper', null,
    '고객사 안에서 제품이 실제로 돌아가게 만드는 엔지니어', null,
    $blog_1$# FDE

FDE는 Forward Deployed Engineer의 약어로, 고객사 안에 들어가 자사 제품이 그곳에서 실제로 돌아가게 만드는 엔지니어입니다. 제품 회사 소속으로 고객 현장에서 프로덕션 코드를 씁니다. Palantir가 2011년에 처음 만든 직무이고, 최근에는 기업의 AX(AI 전환)를 맡는 회사들이 주로 뽑습니다.

## 주요 업무

한 프로젝트 안에서 다음 다섯 가지가 순서대로, 그리고 반복해서 돌아갑니다. OpenAI의 FDE 공고 문구를 빌리면 "발견, 기술 범위 정의, 시스템 설계, 구축, 프로덕션 출시를 직접 맡는(own)" 일입니다.

1. **문제를 정의합니다.** 고객의 엔지니어링 팀과 현업 팀을 만나 어떤 업무를 어디까지 자동화할지, 어떤 데이터가 있는지 확인하고 범위를 정합니다. 요구사항 문서를 받아서 시작하는 것이 아니라, 현장을 본 뒤에 무엇이 필요한지 직접 정합니다.
2. **프로토타입을 만들어 고객 시스템에 통합합니다.** 고객의 데이터, 인프라, 권한 체계와 자사 제품을 연결하는 코드를 씁니다. 프론트엔드와 백엔드를 가리지 않습니다. 코딩 비중은 회사마다 다르고, 같은 회사 안에서도 배포 단계에 따라 움직입니다.
3. **프로덕션까지 가져가고 안정시킵니다.** 고객 환경에서만 생기는 장애를 조사하고, 원인을 찾고, 수정을 배포하고, 모니터링합니다. Palantir의 FDE는 이 과정을 "제품팀, 배포팀, 고객 사이의 소통을 조율하면서 안정성을 지키는 일"이라고 설명합니다.
4. **양쪽과 이야기합니다.** 고객 쪽 이해관계자와 본사의 제품·리서치·영업 팀 사이에서 범위와 우선순위를 조정합니다.
5. **현장에서 배운 것을 본사에 전달합니다.** 여러 고객에서 반복되는 패턴을 도구, 플레이북, 제품 기능으로 정리합니다. Palantir는 "가장 가치 있는 제품 추가 중 일부가 현장에서 시작됐다"고 밝힙니다.

## SI 파견과의 차이

한국에서 "고객사 상주"는 SI(시스템 통합) 파견 인력을 떠올리게 하지만, FDE는 소속, 지휘, 역할, 체류 시간이 모두 다릅니다.

- **소속과 지휘부터 다릅니다.** SI 파견직은 파견법의 적용을 받고 고객사가 업무를 지휘합니다. FDE는 법률상 개념이 아닌 직무 명칭이고, AI·소프트웨어 회사의 정규직이 고객사에 가 있더라도 지휘명령권은 원칙적으로 소속 회사에 있습니다.
- **역할도 다릅니다.** 파견직은 사전에 정리된 요구사항을 수행하는 데 비해, FDE는 현장에서 문제를 함께 정의하고 도입 방향을 설계하는 것부터 시작합니다.
- **체류 시간도 전일 상주가 아닙니다.** Palantir는 FDE 업무 시간의 약 25%를 고객 현장에서 보내는 것으로 알려져 있으며, 한국에 진출한 OpenAI는 고객사 출장 50%를 명시한 바 있습니다.

## 유사 직무와의 차이

- **Solutions Engineer와는 일하는 시점이 다릅니다.** Solutions Engineer는 계약 전에 데모와 개념 검증(PoC)을 만들고, 계약이 되면 다음 고객으로 넘어갑니다. FDE는 계약 뒤에 들어가 고객 환경에서 제품이 돌아갈 때까지 책임집니다.
- **Sales Engineer와는 역할이 다릅니다.** Sales Engineer는 영업 조직에 속해 계약 성사를 목표로 일합니다. FDE는 엔지니어링 직무입니다. Bloomberry가 FDE 공고 1,000건을 분석했을 때 매출 할당량이 붙은 공고는 한 건도 없었습니다.
- **Backend Engineer와는 방향이 다릅니다.** Backend Engineer가 여러 고객이 쓸 하나의 기능을 만든다면, FDE는 한 고객을 위한 여러 기능을 만듭니다. 코드를 쓴다는 점은 같습니다.

## 요구 역량

Bloomberry의 분석에 따르면 FDE 구인공고가 원한 이전 직무 1위는 백엔드·풀스택 소프트웨어 엔지니어(45%)였고, 솔루션 엔지니어·아키텍트, 데이터 엔지니어가 뒤를 이었습니다. 회사마다 문구는 다르지만 요구사항은 같은 곳으로 모입니다. 글로벌 AI 회사와 국내 AI 회사가 공개한 FDE 공고를 겹쳐 보면 세 가지가 공통입니다.

- **프로덕션 수준의 구현력.** Python, TypeScript 등으로 프론트엔드와 백엔드 코드를 쓰고 리뷰할 수 있어야 합니다. 고객 접점이 많은 자리지만 코딩 비중이 낮은 자리가 아닙니다.
- **고객과 직접 일한 경험.** 요구가 모호한 상태에서 범위를 정하고 우선순위를 잡아 본 경험을 요구합니다. 컨설팅, 솔루션 엔지니어링, 또는 고객 요청을 직접 받아 만든 백엔드 경험이 여기에 해당합니다.
- **LLM을 실제 시스템에 붙여 본 경험.** 모델을 만드는 게 아니라, 모델 기반 시스템을 만들거나 배포하면서 모델 동작이 제품 경험에 어떻게 영향을 주는지 이해하는 것입니다.

## FAQ

**FDE는 커리어로 괜찮은 선택인가요?**
수요는 늘고 있습니다. 고객 환경에서 제품을 끝까지 작동시켜 본 경험은 어느 회사에서든 드뭅니다. 다만 같은 이름이라도 회사에 따라 실제 업무가 엔지니어링보다 프리세일즈나 고객 지원 쪽에 가까운 경우가 있으니, 프로덕션 코드를 직접 쓰는 자리인지와 소속 조직이 어디인지는 확인하고 판단하는 편이 안전합니다.

**한국에서도 FDE를 뽑는 회사가 있나요?**
있습니다. 글로벌 AI 회사가 한국이나 아시아 태평양에 들어올 때 영업 조직보다 먼저 여는 자리 중 하나가 FDE입니다. 제품을 현지 고객 환경에 맞게 구축할 사람이 먼저 필요하기 때문입니다. 국내 AI 회사와 대형 IT 서비스 회사도 같은 이름의 팀을 만들기 시작했습니다.

**FDE 연봉은 어느 정도인가요?**
해외에는 공개된 집계가 있지만, 국내는 이 직무 자체가 새로워 공개된 연봉 범위가 제한적입니다. 글로벌 AI 회사의 한국 포지션과 국내 회사의 포지션 사이 편차가 커서 하나의 범위로 말하기 어렵습니다.$blog_1$, null,
    'Forward Deployed Engineer(FDE) 하는 일과 한국 채용 | Harper', null,
    '고객사 안에서 제품이 실제로 돌아가게 만드는 엔지니어입니다. SI 파견과 무엇이 다른지, Solutions Engineer와 어떻게 갈리는지, 한국에서 이 자리를 뽑는 회사를 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-fde.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['deployment-strategist', 'field-cto-site-cto', 'enterprise-sales-engineer']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'deployment-strategist',
    'Roles', null,
    'Deployment Strategist 하는 일, FDE와 무엇이 다른가 | Harper', null,
    '어떤 문제를 먼저 풀지 정하고, 그 해결책이 실제로 쓰이게 만드는 사람', null,
    $blog_2$# Deployment Strategist

Deployment Strategist는 고객사 안에 들어가 자사 제품으로 어떤 문제를 먼저 풀지 정하고, 그 해결책이 실제로 쓰이게 만드는 사람입니다. 제품 회사 소속으로 Forward Deployed Engineer(FDE)와 한 팀을 이뤄 문제 정의, 워크플로 설계, 도입 확산을 맡습니다. Palantir가 만든 직무이고, 최근에는 AI·데이터 플랫폼을 기업 고객에 도입하는 회사들이 주로 뽑습니다.

## 주요 업무

1. **제품이 가장 크게 효과를 낼 업무를 찾습니다.** 고객사 업무가 어떻게 돌아가는지 파악해 어떤 업무를 먼저 바꿀지, 어떤 데이터가 있는지 확인하고 범위를 정합니다. 요구사항을 넘겨받는 것이 아니라 직접 정합니다.
2. **워크플로와 애플리케이션을 설계하고 사용자와 함께 다듬습니다.** 기존 시스템이 못 하는 부분을 중심으로 설계하고, 만든 것을 보여주고 피드백을 받아 고칩니다.
3. **관련된 사람들을 같은 목표로 모읍니다.** 경영진부터 현장 사용자까지 같은 목표를 보게 하고, 일정과 산출물을 관리하며, 고객 경영진을 상대하는 창구가 됩니다.
4. **필요하면 직접 만듭니다.** 데이터 파이프라인 연결, 설정, 프로토타입 같은 것입니다. 코드 비중은 사람마다 다릅니다. Palantir는 자사 DS를 "하루 종일 코드만 쓰고 고객과는 거의 말하지 않는 사람부터, 코드를 전혀 쓰지 않고 여러 프로젝트를 조율하는 사람까지" 폭이 넓다고 설명합니다.
5. **현장에서 확인한 요구를 자사 제품팀에 전달합니다.** 여러 고객사에서 같은 요구가 반복되면 제품 기능으로 만들자고 제안하고, 왜 필요한지 근거를 정리해 보냅니다.

## 기획·컨설팅 직무와의 차이

이름 때문에 전략 기획이나 컨설팅으로 읽히지만, 일하는 곳, 산출물, 기술과의 거리가 다릅니다.

- **일하는 곳이 다릅니다.** 본사 사무실에서 계획을 세우는 것이 아니라 고객사 안에 들어가 일합니다. 컨설팅처럼 제안이 끝나면 떠나는 것도 아니고, 자사 제품이 그 고객 안에서 쓰일 때까지 남습니다.
- **산출물이 다릅니다.** 기획안이나 보고서가 아니라 실제로 돌아가는 워크플로와 애플리케이션입니다. 만든 것이 고객의 업무를 바꿨는지로 평가받습니다.
- **기술과의 거리가 다릅니다.** 엔지니어링 직군에 속한 자리는 아니지만, 코드를 안 쓰는 자리도 아닙니다. 공개 공고 대부분이 SQL이나 Python을 우대 요건으로 적고, 프로덕션 코드는 FDE가 맡습니다.

## 유사 직무와의 차이

- **FDE와는 맡는 것이 다릅니다.** DS가 어떤 문제를 왜 풀지 정하면, FDE가 그것을 어떻게 만들지 맡습니다. 같은 팀입니다. Cursor의 공고는 이 구조를 "Strategist 한 명과 FDE 한두 명이 한 조"라고 씁니다.
- **Solutions Architect와는 언제까지 고객사에 남는지가 다릅니다.** Solutions Architect는 설계까지만 하고 떠나는 데 비해, DS는 그 설계가 실제로 쓰일 때까지 남아 그 사이의 조정을 맡습니다.
- **Technical Account Manager와는 책임지는 단위가 다릅니다.** Technical Account Manager는 고객사 하나를 맡아 계약 기간 내내 관계와 갱신을 관리합니다. DS는 그 고객사 안의 특정 문제를 맡아 해결하고 도입을 넓히며, 문제가 풀렸는지로 평가받습니다.

## 요구 역량

어떤 경력에서 와야 한다는 정답은 없습니다. Palantir는 맞는 전공도 업계도 없다고 쓰고, Scale AI 공고는 이 자리에 맞는 경력으로 Palantir 같은 회사의 DS·FDE 경험, 전략 컨설팅, 기술 PM 셋을 예로 듭니다. 공개된 DS 공고 수십 건을 겹쳐 보면 세 가지가 공통적으로 요구되는 역량입니다.

- **모호한 문제를 구조화하는 능력.** 무엇을 먼저 풀지 정하고 범위를 긋는 일이라, 컨설팅·프로덕트·딜리버리 경험을 요구합니다. 채용도 코딩 테스트가 아니라 케이스 면접으로 합니다.
- **데이터와 코드를 읽고 다룰 수 있는 기초.** SQL과 Python 수준이면 되고, 공고 대부분이 우대 요건으로 적습니다. 프로덕션 코드는 FDE의 몫입니다.
- **경영진과 현장 양쪽과 소통하는 능력.** 시니어 공고는 C레벨 대응을 명시하고, 현장 체류나 출장이 시간의 25~50%인 경우가 많습니다.

## FAQ

**DS는 커리어로 괜찮은 선택인가요?**
같은 직함 아래 실제 업무의 폭이 넓습니다. Palantir는 "같은 DS는 둘도 없다"고 쓰고, 공개 공고 중에는 이름은 같지만 실질이 영업이나 프리세일즈인 것도 섞여 있습니다. 문제 정의부터 도입까지 맡는 자리인지, 소속이 어디인지 확인하고 판단하는 편이 안전합니다.

**한국에서도 DS를 뽑는 회사가 있나요?**
있습니다. 글로벌 AI·데이터 플랫폼 회사가 한국에 들어올 때 FDE와 짝으로 여는 자리 중 하나가 DS이고, 한국어와 영어를 함께 요구하는 경우가 대부분입니다. 국내 회사는 아직 드물고, 일본에서는 자국 SaaS 회사들도 같은 이름의 팀을 두기 시작했습니다.

**DS 연봉은 어느 정도인가요?**
해외에는 공개된 집계가 있지만, 국내는 이 직무 자체가 새로워 공개된 연봉 범위가 제한적입니다. 글로벌 회사의 한국 포지션과 국내 회사의 포지션 사이 편차가 커서 하나의 범위로 말하기 어렵습니다.$blog_2$, null,
    'Deployment Strategist 하는 일, FDE와 무엇이 다른가 | Harper', null,
    '고객사의 어떤 문제를 먼저 풀지 정하고, 그 해결책이 실제로 쓰이게 만드는 사람입니다. Forward Deployed Engineer와 무엇이 다른지, 어떤 배경에서 이 자리로 오는지 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-deployment-strategist.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['forward-deployed-engineer', 'field-cto-site-cto', 'enterprise-sales-engineer']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'field-cto-site-cto',
    'Roles', null,
    'Field CTO / Site CTO 하는 일과 본사 CTO와의 차이 | Harper', null,
    '고객과 시장을 상대하는 제품 회사 소속 기술 책임자', null,
    $blog_3$# Field CTO / Site CTO

Field CTO(회사에 따라 Site CTO)는 소프트웨어 제품 회사에 소속되어 고객과 파트너, 시장을 상대하는 기술 책임자입니다. 본사 CTO가 회사 안의 제품과 엔지니어링 조직을 맡는다면, Field CTO는 회사 밖에서 고객사 CTO와 같은 눈높이로 기술을 논의하고 현장에서 파악한 요구를 제품에 반영합니다. 데이터·인프라 플랫폼 회사에서 자리 잡은 직무이고, 최근에는 AI 회사들도 뽑기 시작했습니다.

## 주요 업무

1. **고객사 경영진과 도입 설계를 함께 정합니다.** 고객사 CTO와 실무 책임자에게 아키텍처, 보안, 확장성을 설명하고 어떻게 도입할지 같이 결정합니다. 제품 설명서를 전달하는 데서 그치지 않고, 고객 환경에서 실제로 어떻게 동작하는지 검증해 보여줍니다.
2. **계약 과정에서 기술 검토를 이끕니다.** 초기 대화부터 참여해 데모와 개념 검증(PoC)을 맡습니다. 한 현직 Field CTO는 이 자리를 "계약을 따내려 한다는 인상을 주지 않으면서 기술 전략을 이야기할 수 있는 사람"이라고 설명합니다.
3. **고객사 시스템과의 통합을 범위 정의부터 배포까지 책임집니다.** 회사에 따라서는 직접 코드를 쓰기도 합니다. 한 엔터프라이즈 AI 회사의 Site CTO 공고는 "직접 코드를 쓰는 엔지니어링 리드"를 요건에 넣었습니다.
4. **회사에 따라 현지 기술팀을 만들고 이끕니다.** 새 시장에 처음 들어가는 회사는 이 자리를 현지의 첫 기술 책임자로 두고, 엔지니어링·통합·프리세일즈(계약 전 기술 검증) 팀을 직접 꾸리게 합니다. 이미 현지 조직이 있는 회사에서는 팀 없이 혼자 일하는 경우가 많습니다.
5. **현장에서 파악한 것을 제품팀에 전달하고, 회사 밖에서는 회사의 기술을 대변합니다.** 고객 요구와 시장 흐름을 제품 로드맵에 반영하고, 콘퍼런스와 언론에서 회사를 대표해 발언합니다. 

## 본사 CTO·창업 CTO와의 차이

이름에 CTO가 붙어 있어 회사 전체의 최고 기술 책임자나 스타트업의 창업 CTO로 읽히기 쉽지만, 다음과 같은 점에서 다릅니다.

- **보는 방향이 다릅니다.** 본사 CTO는 회사 안쪽, 즉 제품과 엔지니어링 조직, 기술 전략을 봅니다. Field CTO는 회사 바깥쪽, 즉 고객과 파트너, 시장을 봅니다.
- **책임지는 것이 다릅니다.** 본사 CTO는 회사의 제품과 엔지니어링 조직 전체를 책임집니다. Field CTO는 고객이 제품으로 성과를 내는지, 담당 시장에서 제품이 자리 잡는지를 책임집니다.
- **자리의 수가 다릅니다.** 본사 CTO는 회사에 한 명이지만, Field CTO는 지역이나 산업별로 두기 때문에 한 회사에 여러 명일 수 있습니다. 공고도 아시아 태평양, 유럽, 미주, 일본, 공공 부문처럼 단위를 나눠서 냅니다.

## 유사 직무와의 차이

- **본사 CTO와는 보는 방향이 다릅니다.** 본사 CTO가 회사 안을 본다면 Field CTO는 회사 밖을 봅니다. 
- **VP of Engineering과는 맡는 조직이 다릅니다.** VP of Engineering은 엔지니어링 조직을 운영하고 제품이 제때 나오도록 책임집니다. Field CTO는 제품을 만드는 엔지니어링 조직을 맡지 않습니다. 팀을 두더라도 현지 고객을 상대하기 위한 팀입니다.
- **Country Manager와는 책임지는 것이 다릅니다.** Country Manager는 그 나라의 매출과 조직 전체를 맡고, Field CTO는 기술과 고객 성과를 맡습니다. 새 시장에 들어갈 때는 이 두 자리가 현지 조직의 첫 책임자가 되기도 합니다.

## 요구 역량

이 자리에 오는 사람의 배경은 솔루션 아키텍트, 프린시펄 엔지니어, 전 CTO, 창업자 등으로 다양합니다. 특정 나라에 두는 자리는 영어와 그 나라 언어를 함께 요구합니다. 공개된 Field CTO 공고 수십 건을 겹쳐 보면 요구 역량은 세 가지로 모입니다.

- **제품을 실제로 출시해 본 엔지니어링·아키텍처 경력.** 대부분의 공고가 상당한 연차를 요구하고, 전직 CTO·CIO나 솔루션 아키텍트 출신을 찾는 곳도 있습니다.
- **고객사 경영진에게 기술을 사업의 언어로 설명하는 능력.** 프리세일즈, 솔루션 아키텍처, 기술 컨설팅 경력이 여기에 해당합니다.
- **회사에 따라, 팀을 만들고 이끈 경험.** 새 시장의 첫 기술 책임자로 뽑는 회사는 Director·VP급 관리 경험이나 창업 경험을 요구합니다. 

## FAQ

**Field CTO와 Site CTO는 같은 자리인가요?**
이름만으로는 알 수 없습니다. 업계에서 널리 쓰는 이름은 Field CTO입니다. Site CTO는 한 엔터프라이즈 AI 회사가 국가별 기술 책임자를 부르는 이름인데, 이 회사는 지역에 따라 같은 자리를 Field CTO라는 이름으로 내기도 합니다. 다만 이 회사의 자리는 직접 코드를 쓰고 현지 팀을 만드는 실무 비중이 커서, 고객에게 조언하는 성격이 강한 업계 일반의 Field CTO와는 하는 일이 다릅니다. 그래서 이름보다 공고 내용을 보는 편이 정확합니다.

**코드를 쓰나요, 팀을 맡나요?**
회사마다 다릅니다. 데이터·인프라 플랫폼 회사의 Field CTO는 대체로 코드를 쓰지 않고 팀도 맡지 않으며, 고객에게 조언하고 현장의 요구를 제품팀에 전달하는 것이 주된 일입니다. 새 시장의 첫 기술 책임자로 뽑는 회사에서는 직접 코드를 쓰면서 현지 기술팀도 만듭니다. 어느 쪽이든 고객 현장에 있는 시간이 깁니다. 한 현직 Field CTO는 "정기적으로 출장을 다닐 수 없다면 이 일은 포기하라"고 썼습니다.

**한국에서도 Field CTO를 뽑는 회사가 있나요?**
공개 공고만 보면 드뭅니다. 글로벌 플랫폼·AI 회사는 이 자리를 아시아 태평양이나 일본처럼 지역 단위로 뽑는 경우가 많습니다. 다만 한국에 들어온 AI 회사가 한국 담당 기술 책임자를 둔 사례는 있습니다.$blog_3$, null,
    'Field CTO / Site CTO 하는 일과 본사 CTO와의 차이 | Harper', null,
    '제품 회사에 소속되어 고객과 시장을 상대하는 기술 책임자입니다. 본사 CTO·창업 CTO와 무엇이 다른지, 조직에서 어떤 위치인지, 어느 정도 연차가 필요한지 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-field-cto-site-cto.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['forward-deployed-engineer', 'deployment-strategist', 'enterprise-sales-engineer']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'enterprise-sales-engineer',
    'Roles', null,
    'Enterprise Sales Engineer 하는 일과 기술영업과의 차이 | Harper', null,
    '계약 전에 제품이 문제를 푼다는 것을 기술로 증명하는 엔지니어', null,
    $blog_4$# Enterprise Sales Engineer

Enterprise Sales Engineer(회사에 따라 Solutions Engineer, Sales Engineer)는 계약 전 단계에서 제품이 고객의 문제를 푼다는 것을 기술로 증명하는 엔지니어입니다. 영업 조직에 속해 영업 대표(Account Executive)와 짝을 이루며, 계약은 영업 대표가, 기술 검증은 Sales Engineer가 맡습니다. 기업용 소프트웨어 회사에서 오래된 직무이고, AI 회사는 데모와 검증에 코드가 필요하기 때문에 엔지니어 경력을 요구합니다.

## 주요 업무

1. **고객의 기술 조직을 만나 요구와 환경을 파악합니다.** 영업 초기에 고객의 엔지니어와 아키텍트를 만나 무엇이 필요한지, 어떤 환경인지 확인하고, 제품이 기술적으로 맞는지 먼저 가립니다.
2. **고객에 맞춘 데모를 만들어 보여줍니다.** 고객의 데이터와 시나리오로 데모를 구성합니다. AI 제품은 데모가 곧 프로토타입이어서 코드를 써서 만듭니다.
3. **개념 검증(PoC)을 설계하고 운영합니다.** 고객과 성공 기준을 합의하고 몇 주 동안 검증을 진행해, 고객이 결과를 보고 판단하게 합니다.
4. **기술 질문에 답합니다.** 제안요청서(RFP), 보안 설문, 아키텍처와 통합 설계에 관한 질문을 맡습니다. 한 외국계 소프트웨어 회사의 Sales Engineer는 "업무의 절반 이상은 고객 지원이고, 그다음은 끊임없이 제품을 공부하는 것"이라고 씁니다.
5. **계약이 되면 다음 팀에 넘깁니다.** 구현과 운영을 맡는 팀에 인수인계하고, 현장에서 들은 요구를 제품팀에 전달합니다.

## 국내 "기술영업"과의 차이

한국에서 기술영업은 대개 견적과 납기까지 다루며 매출을 책임지는 영업직을 뜻하고, 제조업 현장에서는 고객과 내부 엔지니어 사이의 기술 창구를 뜻하기도 합니다. 

- **책임지는 것이 다릅니다.** 기술영업은 계약과 매출을 책임집니다. Sales Engineer는 기술 검증을 책임지고, 계약은 영업 대표가 책임집니다. 보수의 일부는 팀 실적에 따라 달라지지만, 계약을 따내는 책임은 영업 대표에게 있습니다.
- **만드는 것이 다릅니다.** 기술영업의 산출물은 제안서와 견적입니다. Sales Engineer의 산출물은 실제로 돌아가는 데모와 검증 결과입니다.
- **코드를 쓰는 정도가 다릅니다.** 기술영업은 코드를 쓰지 않습니다. Sales Engineer는 데모와 개념 검증 수준의 코드를 쓰고, AI 회사 중에는 Python을 필수로 적는 곳이 많습니다. 다만 제품에 들어가는 프로덕션 코드까지는 쓰지 않습니다.

## 유사 직무와의 차이

- **Solutions Engineer와는 대개 이름만 다릅니다.** 같은 일을 회사에 따라 Sales Engineer, Solutions Engineer, Solution Consultant로 부릅니다. 한국에 들어온 외국계 회사의 공고는 대부분 Solutions Engineer라는 이름을 씁니다.
- **Forward Deployed Engineer와는 일하는 시점과 쓰는 코드가 다릅니다.** Sales Engineer는 계약 전에 데모와 개념 검증을 만들고, Forward Deployed Engineer는 계약 뒤에 들어가 고객 환경에서 제품이 돌아갈 때까지 프로덕션 코드를 씁니다.
- **Account Executive와는 책임지는 것이 다릅니다.** Account Executive는 잠재 고객 발굴부터 계약 체결까지 책임지고 매출 목표를 집니다. Sales Engineer는 고객 쪽 기술 검토자를 상대로 기술 검증을 책임집니다.

## 요구 역량

이 자리에 오는 사람의 배경은 백엔드·풀스택 엔지니어, 솔루션 아키텍트, 기술 컨설턴트 등입니다. 학위는 따로 요구하지 않습니다. 한국 근무 자리는 대체로 한국어와 영어를 함께 요구합니다. 공개된 Sales Engineer 공고 수십 건을 겹쳐 보면 다음 세 가지가 공통입니다.

- **데모와 개념 검증을 직접 만들고 운영하는 능력.** 거의 모든 공고가 핵심 업무로 적습니다.
- **기술을 고객의 문제에 맞춰 설명하고 기술 검증을 이끄는 능력.** 프리세일즈(계약 전 기술 검증), 솔루션 엔지니어링, 솔루션 아키텍처 경력이 여기에 해당합니다.
- **코드를 읽고 쓰는 기초.** AI 회사는 Python을 필수로 적고, 데이터·인프라 회사는 아키텍처 지식을 더 봅니다.


## FAQ

**영업 직무인가요, 엔지니어 직무인가요?**
영업 조직에 속한 엔지니어입니다. 계약을 따내는 책임은 영업 대표에게 있고, Sales Engineer는 제품이 고객 환경에서 동작하는지를 기술로 증명합니다. 다만 보수의 일부가 팀 실적에 따라 달라지는 것이 보통이라, 영업과 무관한 자리는 아닙니다.

**코드를 쓰나요?**
데모와 개념 검증 수준의 코드를 씁니다. 제품에 들어가는 프로덕션 코드는 쓰지 않습니다. AI 제품은 데모가 곧 프로토타입이어서 Python을 필수로 적는 회사가 많습니다.

**연봉은 어떻게 되나요?**
기본급에 변동급이 더해지는 구조가 일반적입니다. 변동급의 비율과 기준은 회사마다 달라 하나로 말하기 어렵습니다.

**한국에서도 뽑는 회사가 있나요?**
있습니다. 한국에 들어온 글로벌 소프트웨어·AI 회사가 한국 고객을 상대할 사람으로 뽑으며, 공고 이름은 대부분 Solutions Engineer입니다. 한국 스타트업은 Sales Engineer라는 이름을 쓰기도 합니다.$blog_4$, null,
    'Enterprise Sales Engineer 하는 일과 기술영업과의 차이 | Harper', null,
    '계약 전 단계에서 제품이 고객의 문제를 푼다는 것을 기술로 증명하는 엔지니어입니다. 국내에서 말하는 기술영업과 무엇이 다른지, 코드를 쓰는 자리인지 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-enterprise-sales-engineer.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['forward-deployed-engineer', 'deployment-strategist', 'field-cto-site-cto']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'applied-ai-engineer',
    'Roles', null,
    'Applied AI Engineer 하는 일, ML Engineer와의 차이 | Harper', null,
    '이미 만들어진 AI 모델로 실제 문제를 푸는 시스템을 만드는 엔지니어', null,
    $blog_5$# Applied AI Engineer

Applied AI Engineer는 이미 만들어진 AI 모델로 고객이나 제품의 실제 문제를 푸는 시스템을 만드는 엔지니어입니다. 모델을 직접 학습시키지 않고 API와 공개 모델로 검색, 에이전트, 평가 체계를 만들며, 대부분 고객을 직접 만나는 자리입니다. AI 랩과 AI 제품 회사가 뽑고, 회사에 따라 Forward Deployed Engineer나 AI Deployment Engineer라는 이름으로 내기도 합니다.

## 주요 업무

1. **어떤 문제를 어떤 모델과 구조로 풀지 정합니다.** 고객이나 제품의 문제 중 가치가 큰 것을 골라, 검색·에이전트·툴 연동 가운데 무엇으로 풀지와 성공을 무엇으로 잴지를 정합니다.
2. **시스템을 만들어 프로덕션까지 올립니다.** 프로토타입에서 시작해 통합, 안정화, 출시까지 직접 코드를 씁니다. OpenAI는 이 자리의 성공 기준을 "프로덕션에서 돌아가는 시스템과 지속적인 사용, 고객 성과"로 적고, "데모가 성공하는 것이 아니다"라고 덧붙입니다.
3. **평가 체계를 만듭니다.** 모델의 출력은 매번 같지 않아서, 대표 데이터와 채점 기준, 실제 운영 데이터로 결과를 재는 체계를 만드는 것 자체가 일입니다. 이 체계를 기준으로 모델 동작과 응답 속도, 비용, 안전성을 조정합니다.
4. **고객사 엔지니어링 팀과 함께 통합·운영 문제를 풉니다.** 고객의 기존 시스템, 데이터 환경, 보안 요건에 맞춰 연결하고, 장애가 나면 재현해 원인을 찾습니다.
5. **고객 현장에서 배운 것을 제품·리서치 팀에 전달합니다.** 여러 고객에서 반복되는 패턴을 재사용할 수 있는 구조와 도구로 정리해 다음 도입을 빠르게 합니다.

## 모델을 만드는 직무와의 차이

이름에 AI가 붙어 모델을 만드는 자리로 읽히지만, 만드는 것, 성공 기준, 요구하는 배경이 다릅니다.

- **모델을 만들지 않고 활용합니다.** OpenAI는 Applied AI Engineering을 "강력한 모델을 사람과 조직을 위한 신뢰할 수 있고 유용한 시스템으로 바꾸는 일"이라고 정의합니다. 모델을 학습시키는 것은 모델을 만드는 조직의 일입니다.
- **성공 기준이 다릅니다.** 모델을 만드는 쪽은 벤치마크 성능으로 평가받고, 이 자리는 시스템이 고객 환경에서 돌아가고 계속 쓰이는지로 평가받습니다.
- **요구하는 배경이 다릅니다.** 공개 공고 중 논문이나 학위를 요구하는 곳은 없고, 대신 소프트웨어 엔지니어링과 평가 경험을 봅니다.

## 유사 직무와의 차이

- **Machine Learning Engineer와는 모델을 만드는지 활용하는지가 다릅니다.** Machine Learning Engineer는 제품에 들어갈 모델을 직접 만들고 배포합니다. Applied AI Engineer는 만들어진 모델로 시스템을 만듭니다.
- **Research Engineer와는 일하는 곳이 다릅니다.** Research Engineer는 새 모델을 만드는 연구 조직 안에서 일합니다. Applied AI Engineer는 만들어진 모델과 고객 사이에서 일합니다.
- **Backend Engineer와는 다루는 것이 다릅니다.** Backend Engineer는 입력이 같으면 결과도 같은 시스템을 만들고, Applied AI Engineer는 출력이 확률적인, 즉 같은 입력에도 결과가 달라질 수 있는 모델을 다룹니다. 그래서 평가가 일의 중심에 있습니다. 코드를 쓴다는 점은 같고, 공고들도 요구 배경에 소프트웨어 엔지니어를 적습니다.

## 요구 역량

이 자리에 오는 사람의 배경은 백엔드·풀스택 엔지니어, Forward Deployed Engineer, 솔루션 아키텍트 등입니다. 한국 근무 자리는 한국어와 영어를 함께 요구합니다. 공개된 Applied AI Engineer 채용공고 수십 건을 겹쳐 보면 다음 세 가지가 공통입니다.

- **프로덕션 수준의 소프트웨어 엔지니어링 능력.** Python이 기본이고, TypeScript를 함께 적는 곳이 많습니다.
- **LLM을 실제 시스템에 통합하고 평가해 본 경험.** 검색·에이전트·툴 연동을 만들어 보고, 그 결과를 체계적으로 측정해 본 경험입니다.
- **고객사 엔지니어와 경영진 양쪽에 기술을 설명하는 능력.** 대부분의 공고가 고객을 직접 만나는 것을 전제로 합니다.

## FAQ

**백엔드 엔지니어가 넘어갈 수 있나요?**
가능합니다. 공고들이 요구 배경에 소프트웨어 엔지니어를 적고 있고, LLM 경험이 필수가 아니라고 적은 곳도 있습니다. 새로 익혀야 하는 것은 매번 달라지는 출력을 평가하는 방법입니다.

**논문이나 학위가 필요한가요?**
필요하지 않습니다. 공개 공고 중 논문이나 대학원 학위를 필수로 적은 곳은 없고, 학사 또는 그에 준하는 경력을 봅니다.

**한국에서도 Applied AI Engineer를 뽑는 회사가 있나요?**
있습니다. 글로벌 AI 회사가 한국에 들어올 때 뽑는 자리 중 하나이고, 한국어와 영어를 함께 요구합니다.$blog_5$, null,
    'Applied AI Engineer 하는 일, ML Engineer와의 차이 | Harper', null,
    '이미 만들어진 AI 모델로 고객과 제품의 실제 문제를 푸는 시스템을 만드는 엔지니어입니다. ML Engineer·Research Engineer와 무엇이 다른지, 학위가 필요한지 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-applied-ai-engineer.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['forward-deployed-engineer', 'deployment-strategist', 'field-cto-site-cto']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  ),
(
    'machine-learning-engineer',
    'Roles', null,
    'Machine Learning Engineer와 Research Engineer 차이 | Harper', null,
    '제품에 들어갈 모델을 만들거나, 모델 연구를 돌아가게 하는 엔지니어', null,
    $blog_6$# Machine Learning Engineer / Research Engineer

Machine Learning Engineer는 제품에 들어갈 모델을 만들고 배포하는 엔지니어이고, Research Engineer는 새 모델을 만드는 연구가 대규모로 돌아가게 하는 엔지니어입니다. 둘 다 모델을 만드는 쪽의 자리이고, 고객을 직접 만나지 않습니다. 제품 회사는 주로 Machine Learning Engineer를, AI 랩과 연구 조직은 Research Engineer를 뽑으며, 연구자(Research Scientist)와 한 공고로 묶어 뽑는 곳도 많습니다.

## 주요 업무

1. **데이터를 모으고 다듬습니다.** 학습에 쓸 데이터를 수집하고 정제하고 걸러냅니다. 대규모 모델에서는 이 단계만 맡는 팀이 따로 있을 정도입니다.
2. **모델을 학습시키고 조정합니다.** Machine Learning Engineer는 추천, 검색, 랭킹처럼 제품에 들어갈 모델을, Research Engineer는 대규모 분산 학습과 사후학습(post-training, 기본 학습을 마친 모델을 추가로 다듬는 단계)을 맡습니다.
3. **학습·평가 파이프라인과 인프라를 만듭니다.** Research Engineer 업무의 중심입니다. OpenAI는 이 자리의 요건을 "대규모 분산 머신러닝 시스템을 설계하고 구현하고 개선하는 탄탄한 엔지니어링 기술"이라고 적습니다.
4. **모델을 배포하고 추론을 최적화합니다.** Machine Learning Engineer 업무의 중심입니다. 양자화·증류로 모델을 가볍게 만들고 추론을 최적화해, 모델이 실제 서비스에서 요청을 처리하게(서빙) 합니다.
5. **실험과 지표로 검증합니다.** 결과를 재현할 수 있는 실험으로 확인하고, Research Engineer는 논문과 연구 성과에도 기여합니다.

## Research Scientist와의 차이

연구 조직에서는 Research Scientist와 나란히 일해서 같은 자리로 보이지만, 맡는 것과 요구하는 학위가 다르고, 둘의 경계는 회사마다 다릅니다.

- **맡는 것이 다릅니다.** 머신러닝 시스템 설계에 관한 책을 쓴 Chip Huyen은 "Research Scientist가 독창적인 아이디어를 낸다면, Research Engineer는 엔지니어링 기술로 그 아이디어의 실험을 준비하고 돌린다"고 씁니다.
- **요구하는 학위가 다릅니다.** Research Scientist는 박사나 1저자 논문을 요구하는 것이 보통이고, Research Engineer는 그렇지 않습니다.
- **둘의 경계는 회사마다 다릅니다.** Anthropic은 채용 페이지에 "엔지니어가 연구를 많이 하고, 연구자가 엔지니어링을 많이 한다"고 쓰고, 두 직무를 한 공고로 뽑는 회사도 많습니다.

## 유사 직무와의 차이

- **Applied AI Engineer와는 모델을 만드는지 활용하는지가 다릅니다.** Applied AI Engineer는 만들어진 모델로 고객이나 제품의 시스템을 만들고, 대부분 고객을 만납니다. Machine Learning Engineer와 Research Engineer는 모델을 만들고, 고객을 만나지 않습니다.
- **Research Scientist와는 맡는 것이 다릅니다.** Research Scientist가 아이디어와 실험 설계를 맡는다면, Research Engineer는 그것이 대규모로 돌아가게 하는 것을 맡습니다. 
- **Data Scientist와는 산출물이 다릅니다.** Data Scientist는 데이터를 분석해 의사결정의 근거를 만들고, 이 두 자리는 실제로 돌아가는 모델과 시스템을 만듭니다.

## 요구 역량

학위 요구는 조직의 종류에 따라 갈립니다. 제품 회사의 Machine Learning Engineer는 학위보다 경력과 배포 실적을 봅니다. 한국의 대기업 연구 조직과 AI 반도체·통신사의 Research Engineer는 석사를 필수로, 박사와 논문을 우대로 적는 것이 일반적입니다. 글로벌 AI 랩의 Research Engineer는 학사를 최소 요건으로 두는 곳이 많습니다. Anthropic은 "약 절반이 박사지만 대학을 안 간 뛰어난 동료도 많다"고 씁니다. 공개된 Machine Learning Engineer·Research Engineer 공고 수십 건을 겹쳐 보면 세 가지가 공통입니다.

- **머신러닝·딥러닝 이론과 PyTorch로 직접 구현하는 능력.** 모델을 직접 만들고 고치는 자리라 이론이 필요합니다.
- **대규모 학습·서빙 시스템 경험.** 분산 학습 프레임워크, 추론 엔진, GPU 자원을 다뤄 본 경험입니다. Research Engineer 공고는 이 항목의 비중이 가장 큽니다.
- **실험을 설계하고 지표로 검증하는 능력.** 바뀐 것이 실제로 나아졌는지 재현 가능한 방법으로 확인합니다.

## FAQ

**Machine Learning Engineer와 Research Engineer는 같은 자리인가요?**
아닙니다. Machine Learning Engineer는 제품에 들어갈 모델을 만들고 배포하고, Research Engineer는 새 모델을 만드는 연구의 인프라와 실험을 맡습니다. 다만 스타트업에서는 한 사람이 학습과 배포, 활용까지 섞어 맡는 채용공고도 있습니다.

**학위가 필수인가요?**
조직의 종류에 따라 다릅니다. 제품 회사의 Machine Learning Engineer는 학위를 요구하지 않는 곳이 대부분입니다. 한국 연구 조직의 Research Engineer는 석사가 일반적이고, 글로벌 AI 랩은 학사를 최소 요건으로 두는 곳이 많습니다. Research Scientist는 박사가 보통입니다.

**AI 회사에서 이 자리는 어느 조직에 속하나요?**
Machine Learning Engineer는 제품 조직에, Research Engineer는 연구 조직이나 모델 플랫폼 조직에 속합니다. 고객을 만나는 조직에는 Applied AI Engineer가 따로 있습니다.$blog_6$, null,
    'Machine Learning Engineer와 Research Engineer 차이 | Harper', null,
    '제품에 들어갈 모델을 만드는 자리와, 연구가 대규모로 돌아가게 하는 자리입니다. 둘의 차이, Research Scientist와의 차이, 학위가 필수인지 정리했습니다.', null,
    'Harper',
    '/images/logo.png',
    '/images/blog/cover-machine-learning-engineer.png',
    '2026-09-20'::date,
    true,
    false,
    array['Roles', 'AI careers']::text[],
    'faq',
    array[]::text[],
    array['forward-deployed-engineer', 'deployment-strategist', 'field-cto-site-cto']::text[],
    'migration:20260915100000',
    'migration:20260915100000'
  )
on conflict (slug) do update set
  category_ko = excluded.category_ko,
  title_ko = excluded.title_ko,
  excerpt_ko = excluded.excerpt_ko,
  content_ko = excluded.content_ko,
  seo_title_ko = excluded.seo_title_ko,
  seo_description_ko = excluded.seo_description_ko,
  author_name = excluded.author_name,
  author_avatar_url = excluded.author_avatar_url,
  thumbnail_url = excluded.thumbnail_url,
  published_at = excluded.published_at,
  is_published = excluded.is_published,
  is_pinned = excluded.is_pinned,
  tags = excluded.tags,
  schema_type = excluded.schema_type,
  related_job_slugs = excluded.related_job_slugs,
  related_post_slugs = excluded.related_post_slugs,
  updated_by = excluded.updated_by,
  updated_at = timezone('utc', now());

commit;
