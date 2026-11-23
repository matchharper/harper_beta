# Harper Repository Instructions

> [!IMPORTANT]
> **사용자가 말한 내용 중 앞으로의 기획·개발·구현에 계속 반영할 사항은 별도 요청이 없어도 기록한다.** 이 파일 맨 아래의 [사용자 지침 이력](#사용자-지침-이력)에 사용자가 말한 날짜, 발언의 요지, 앞으로 어떻게 반영할지를 새 항목으로 덧붙인다. 이후 관련 작업을 시작할 때 이력을 읽고 반영한다.

공통 설계·검증·권한 경계는 [Workspace Instructions](../AGENTS.md)를 따른다. 아래는 웹 프로젝트에 필요한 경로와 작업별 계약이다.

## 프로젝트 계약

- `/org`와 회사 Slack에서 응답하는 원본 모델은 **company-side LLM**으로 부른다. 코드 주석·문서·구현 논의에서 같은 용어를 사용한다.
- `origin/main` push는 운영 Vercel 배포를 유발한다. 현재 요청의 명시적인 배포 승인 없이 push하지 않는다. 일반 운영 배포는 Git-triggered 경로를 사용하고 배포 revision을 확인한다.
- 배포와 실제 가격·운영 정책 변경의 Notion 동기화는 [배포 계약](docs/agent-guidance/release.md)을 따른다. 로컬 구현을 운영 동작으로 문서화하지 않는다.

## 개발시 주의사항
1. 우리는 LLM과 agent에 기반한 서비스이다. 따라서 모든 db의 입력을 코드에서 정하는게 아니기 때문에, supabase db 등에서, 정말 필요한 제약이 아니라면 제약을 최대한 없애야한다. ex) 필요없는 글자 수 제한, 필수가 아닌 값을 required 변수로 둔다거나, 필요없는 중복 방지 제약 등등
2. 좋은 코드를 작성하는 법은 ./FRONTEND.md를 참고해라.


## 작업별 문서

해당 작업에 적용할 문서를 먼저 읽는다. `agent-guidance` 문서 안에 연결된 기존 기능별 정본도 해당 절에 따라 읽는다.

| 작업 | 계약·정본 |
| --- | --- |
| “시나리오 작성해” 등 Career-side 사용자 시나리오 작성·선정·수정 | [사용자 시나리오 작성 기준과 대표 사례](docs/career-side-user-scenarios-ko.md) |
| Career 제품 목적·새로운 가치와 방법의 발굴·능력 개선·효율화 | [Career의 목적과 설계 방향](docs/career-value-and-agent-direction-ko.md) |
| Career 기회 탐색·평가·추천의 방향 토론·의견·설계·리뷰 | [좋은 기회를 어떻게 추천할까](docs/career-good-opportunity-recommendation-ko.md). 토론으로 생각이 바뀌면 이 문서를 고친다 |
| Career agent의 맥락·기록·기억 구조(note, Memory, 회사 공유 자료와 캐시, 실행 기록, 예약·팔로우·메일로 깨우기) 토론·의견·설계·구현·리뷰 | [Career harness](docs/career-agent-harness-ko.md). 토론이나 구현으로 바뀌면 이 문서를 고친다. 기회 탐색과 겹치면 위 문서도 함께 고친다 |
| LLM prompt·context·tool·formatter·schema | [LLM 설계·입력·검증](docs/agent-guidance/llm-engineering.md) |
| Career 지침 변경·A/B/C 선택·복원 | [현재 선택과 A 복원](docs/agent-guidance/career-guidance-selection.md) |
| Company-side LLM tool policy·schema·result·loader·기능 목록·기본 context | [도구 정보 설계 가이드](docs/company-side-tool-information-guide-ko.md) |
| Company-side LLM prompt·context·tool·model·evaluation | [Company-side agent 변경 정본](docs/company-side-agent-engineering-contract-ko.md) |
| 회사 대화 기반 Role 검색·평가 이력·범위별 Memory | [회사 agentic Role 검색](docs/company/company-agentic-role-search-implementation-ko.md)와 연결된 평가 계약 |
| Career 정보 저장·조회·추천, Memory·Brief | [Career Memory 계약](docs/agent-guidance/career-memory.md), [통합 Memory 설계](docs/talent-unified-memory-implementation-plan-ko.md) |
| Role Hiring Brief/Request 생성·수정·리뷰·DB 직접 쓰기 | [Hiring Brief 작성 정본](docs/company/company-role-hiring-brief-authoring-guide-ko.md), [회사 작업 계약](docs/agent-guidance/company-workflows.md)의 authoring 절 |
| 회사 추천·연락·설정·진행 이력, company-first 검색/선정 | [회사 작업 계약](docs/agent-guidance/company-workflows.md)의 해당 절 |
| Wonderful Role non-fit·missing-fit·fit recovery audit | [회사 작업 계약의 recovery audit 절](docs/agent-guidance/company-workflows.md#company-role-fit-recovery-audit)에 연결된 정본 3개 |
| `official_jobs`·LinkedIn 게시물·정기 LinkedIn Jobs GTM | [회사 작업 계약의 LinkedIn GTM 절](docs/agent-guidance/company-workflows.md#linkedin-jobs-marketplace-gtm) |
| UI·문구·디자인·Slack/web 대화 E2E | [UI 작업 계약](docs/agent-guidance/ui-and-writing.md), [Design.md](src/styles/Design.md) |
| `/career` 번역 계획·변경·리뷰·동기화 | [scripts/translation.md](scripts/translation.md) |
| LLM 평가·모델 benchmark | [평가 레지스트리 계약](docs/agent-guidance/evaluations.md)과 해당 task README |
| 배포·migration·요금/운영 정책의 기존 적용 범위 확인 | [배포 계약](docs/agent-guidance/release.md), [관련 운영 적용 기록](docs/agent-guidance/rollout-history.md) |

## Career 번역
- 새로 만들거나 바꾸는 영어 번역은 Codex가 코드·제품 맥락을 읽고 직접 작성한다. Gemini·다른 LLM·자동 번역 API를 초안·fallback에도 사용하지 않는다.
- 현재 번역 계획에서 코드로 생성·변경한 key만 번역 DB에 쓴다. pull-only DB 차이는 로컬 사전에만 반영하고 다시 DB에 쓰지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 사용자 지침 이력

- **2026-11-18** — 수동 Harper 연결 추천은 별도 선정 이력을 필수로 요구하지 않는다. 불필요한 선정·판단 제약 자체를 제거하고, 실제 추천 저장과 연락 완료를 확인한다. 이미 해당 기회를 안내한 후보자에게는 같은 메일을 중복 발송하지 않는다.


- **2026-11-17** — 사용자는 앞으로도 적용할 발언을 알아서 기록해 달라고 했다. 이후 대화에서 그런 내용이 나오면 발언 날짜와 요지, 다음 작업에 적용할 방침을 이력 끝에 덧붙인다.
- **2026-11-17** — Career 채팅의 할 일은 세로로 나열한다. 각 행 왼쪽에는 체크 상태를, 오른쪽에는 그 일만 반영하는 버튼을 둔다. 반영한 항목만 체크하고 나머지는 계속 진행할 수 있게 한다.
- **2026-11-17** — Career 매칭 조사 노트는 문장별 고정 번호로 고치거나 지울 수 있게 한다. 최근에 추가한 문장부터 보여 주고 이전 기록은 이어 읽게 한다. [구현과 검증](docs/career-matching-research-notebook-design-ko.md)
- **2026-11-17** — Career 채팅에서 반영한 할 일에는 왼쪽에 `bg-action` 배경의 흰 체크를 두고 항목명을 연한 색과 취소선으로 표시한다. 오른쪽 버튼 자리에는 ‘완료’를 표시한다.
- **2026-11-17** — Career에서 처음 탐색 방향을 잡거나 크게 바꾸면, 사용자가 말한 선호와 그 경력으로 도전할 만한 기회를 연결해 왜 그쪽을 찾아보는지 설명한다. 비슷한 경력의 사람들이 어디로 옮기는지 언급할 때는 근거를 갖춘다.

- **2026-11-17** — Career 채팅과 문서 추가는 파일당 20MB까지 비공개 Storage 직접 업로드를 사용한다. 문서 텍스트는 기본 발췌와 전체 읽기를 지원하고, 채팅에 첨부한 이미지는 해당 입력을 처리할 때만 모델에 전달한다.
- **2026-11-17** — Career에서 조사한 공개 회사 자료는 회사별 대표 workspace에 모아 다른 사용자가 출처와 함께 다시 읽게 한다. 저장할 때 모델에게 workspace ID 검색을 선행시키지 않는다. 기존 `company_data` 소비처의 호환성과 별도 두 사용자의 실제 모델 입력·도구 호출·웹 조회 횟수로 전환을 확인한다.
- **2026-11-17** — Career 기회 상세는 LLM이 대부분 읽고 쓰는 화면이므로 면접관·단계·질문 같은 내용별 테이블이나 고정 섹션을 만들지 않는다. 기존 문서·폼·`[[career_ui]]` 참조·work처럼 범용 형태를 재사용하고, LLM이 적은 비용으로 읽고 고칠 수 있는지를 먼저 검토한다.
- **2026-11-17** — Career 매칭 노트는 그 탐색의 유일한 작업 기록으로 둔다. 실제로 한 검색·열람·추천과 사용자 반응은 서버가 노트에 남기고, Harper는 같은 노트에 생각을 덧붙인다. 노트를 쓰게 하는 지시를 늘리기보다 노트가 왜 필요한지(다음 요청은 노트에서 이어진다)를 알려 LLM이 판단하게 한다. [구현과 검증](docs/career-matching-research-notebook-design-ko.md)
- **2026-11-17** — Career 기회는 출처와 상관없이 `talent_opportunity_recommendation` 한 곳에 추천 기록을 남긴다. 한 행은 Role(공식 공고·채용 글) 또는 회사(`company_workspace_id`)를 가리킨다. `/career/history` 목록은 internal role과 external로만 나누고, external은 내용과 버튼만 출처별로 다른 같은 카드를 쓴다. [설계와 구현](docs/career-unified-opportunities-ko.md)
- **2026-11-17** — 추천·조회에서 회사의 기준은 `company_workspace`다. `company_db`를 회사 식별 기준으로 삼지 않는다.
- **2026-11-17** — `company_roles` 구조는 바꾸지 않는다. 새로 찾은 LinkedIn·X 채용 글도 `company_roles`에 저장하고, `documents`에는 저장하지 않는다.
- **2026-11-17** — 공고·채용 글·회사는 `search_opportunities`에서 종류를 골라 같은 평가 경로로 평가한다. 출처마다 다른 평가 도구를 쓰게 하지 않는다. 틀을 줄이고 agent가 넓게 찾아 스스로 판단하게 한다.
- **2026-11-17** — 회사 자료의 중심은 그 회사가 이미 쓰는 `company_workspace`다. 공고가 쓰는 workspace에 `company_datas`를 달아, 공식 URL이나 디렉터리 연결이 없어도 다른 사용자가 공고에서 같은 자료를 읽게 한다. 회사 정보를 LLM에 줄 때는 `summary`를 함께 주고, 옛 `company_data`의 투자 필드는 LLM 입력과 화면에 쓰지 않는다. [workspace 중심 전환](supabase/migrations/20261117160000_career_company_workspace_hub.sql)
- **2026-11-17** — 후보자 랜딩은 예전 neutral·주황 대신 `/career`의 Floating Sky 색 기준(하늘색 회색 바탕, 글라스 표면, 잉크 검정 하나의 강조)을 따른다. 랜딩 문구는 AI가 쓴 티가 나지 않게 구체적이고 자연스럽게 쓰고, 디자인·애니메이션은 기준을 먼저 정한 뒤 실제 화면에서 반복해 다듬는다. 새 랜딩 시안은 `/temporal_index`(`src/components/landing/temporal/`)에서 만들고 기존 `/`는 건드리지 않는다.
- **2026-11-18** — 로컬 `/career/history`의 직접 지원 영역에서는 최근 매칭을 `TabBoxes`로 선택해 공고와 조사 노트를 확인한다. 노트는 클릭하면 전문을 펼쳐 보며, 이 내부 조회 UI와 노트 API는 개발 환경에만 둔다.
- **2026-11-18** — 랜딩 문구는 별도 사전 파일에 모으지 않고, 쓰는 컴포넌트 안에서 `/org`처럼 `c("한글", "English")`로 두 언어를 나란히 적는다(`useC()`). 랜딩 디자인 코드는 CSS 모듈 대신 Tailwind 클래스로 쓰고, 여러 곳에서 반복되는 외관만 `src/components/landing/temporal/tw.ts`에 모은다.
- **2026-11-18** — `/jobs` 공고에 Harper 내부 Role이 연결되어 있지 않으면, 회원가입 온보딩 문구와 Talk to Harper 첫 메시지 초안은 그 공고 같은 기회를 Harper가 찾아 준다는 흐름으로 바꾼다. 공개 공고는 익명 회사 Role이어도 `role_id`를 그대로 내려보내고, 연결 여부는 `role_id` 유무로 판단한다. 사용자는 내부·외부 기회 개념이 없으므로 `role_id`가 없는 공고에는 연결 불가 같은 설명 없이 ‘이런 기회를 찾아 달라’는 요청만 넣고, `role_id`가 있는 공고는 기존 동작을 그대로 둔다.
- **2026-11-18** — prompt·context에서 특정 도구(예: `search_opportunities`)를 해결 방법으로 내세우지 않는다. 사실과 목적만 주면 agent가 다른 방법까지 포함해 알아서 더 잘 찾는다.
- **2026-11-18** — Career 회사 데이터의 중심은 `company_workspace`다. `company_db`는 다른 용도로 만든 데이터라서, LinkedIn 회사 URL이 확인되고 workspace와 겹치지 않는 회사만 workspace로 옮겨 쓴다. [탐색 재설계 4.1](docs/career-opportunity-finding-design-ko.md)
- **2026-11-18** — LLM에 돌려주는 도구 결과에는 판단에 필요한 정보만 담고 글을 효율적으로 쓴다. 점수는 가중합 점수 하나만 주고, 맥락에 이미 있는 내용은 반복하지 않는다. 도구를 만들거나 결과 형식을 바꿀 때마다 이 기준으로 확인한다. [탐색 재설계 6절](docs/career-opportunity-finding-design-ko.md)
- **2026-11-18** — "비슷한 경력의 사람들이 어디로 옮겼나" 같은 경력 이동 집계는 agent가 필요할 때 쓰는 여러 도구 중 하나로만 둔다. 도구 설명에는 하는 일만 적는다. 핸드북, prompt, 다른 도구 결과에는 이 도구를 쓰라거나 먼저 보라는 말을 넣지 않는다.
- **2026-11-18** — Harper 연결(내부) `company_workspace`와 그 공고는 평가 방식이 다르다. 그래서 Career 외부 기회 탐색·평가 과정에서 뺀다. 공고 검색, 회사 평가, 이름 해석, 회사 색인, 경력 이동 집계, 후보 풀이 모두 해당한다. 내부 기회는 회사 쪽 선정과 사용자가 고른 공개 공고 경로로만 다룬다. [탐색 재설계 4.6](docs/career-opportunity-finding-design-ko.md)
- **2026-11-18** — Talent 지표에서 ‘맡김’은 talent가 Harper에 지원을 맡긴 것이다. 외부 기회에서 ‘Harper와 지원하기’를 누르거나(`logs.type = career_click_apply_with_harper`) 내부 기회에 연결을 요청한 것(`agent_contact_messages`의 회사 방향 첫 메시지)을 센다. [구현](src/lib/ops/talentMetricsOverview.sql.ts)
- **2026-11-18** — Role 익명(`is_anonymous`)은 LinkedIn 등 공개 홍보에서 회사를 가리는 설정이다. 가입한 후보자와의 Harper 대화에서는 익명 Role도 실제 회사명·Role 정보를 쓴다. `/jobs` 공개 페이지는 지금처럼 익명을 유지하고, 처음부터 익명으로 쓴 Role 없는 공고에 실제 회사명을 따로 채우지 않는다.
- **2026-11-18** — `dev.matchharper.com`은 처음 접속할 때 회사 Google 인증을 거치고, Google이 확인한 `matchharper.com` 조직 계정만 허용한다. Vercel 팀 초대를 요구하지 않으며, 개발 사이트 입장 인증은 Harper 고객 로그인·테스트 계정과 분리한다. [로컬 구현과 적용 순서](docs/dev-domain-access-ko.md)
- **2026-11-18** — 통계를 주는 도구(경력 이동, 공고 수요, 공개 연봉 등)의 결과는 섹션마다 한두 줄로 짧게 준다. 표본이 작은 값은 숫자 대신 표본 수만 준다. Harper 색인이 시장의 일부라는 점은 도구 설명에 사실(어디서 모은 공고인지)로만 적는다. 시장에 대해 알게 된 것을 노트에 남기는 이유는 노트의 목적으로만 알린다. 웹 검색 같은 특정 행동을 지시하지 않는다. [탐색 재설계 4.3](docs/career-opportunity-finding-design-ko.md)
- **2026-11-18** — 연봉 추정(외부 공고 자동 채우기, ops 연봉 추정)도 회사 정보를 `company_datas`의 `summary`로 모델에 준다. 옛 `company_data`에서는 평균 연봉만 읽고 투자 필드는 넣지 않는다.
- **2026-11-18** — 시장 통계 도구(경력 이동, 공고 수요, 공개 연봉)는 만들지 않는다. 필요한 시장 정보는 agent가 직접 찾아 쓴다. 회사 단위 사실(팀 규모·증감, 합류자의 이전 회사, 같은 학교·회사 출신 재직자 수)은 회사 카드에 붙인다. 바로 앞 두 항목 중 통계 도구에 관한 부분은 이 항목으로 대체한다.
- **2026-11-18** — Career 채팅의 `suggest_form` 폼은 답변을 보낸 뒤에도 폼 안에 "답변을 보냈어요." 같은 상태 문구를 넣지 않는다. 저장된 값과 대화 기록이 결과를 보여 준다. 종료된 폼의 안내만 남긴다.
- **2026-11-18** — 실행 기록에서 도구 실패가 보이면 종류와 상관없이 원인을 찾아 고친다. 실패가 DB 제약 때문이면 그 제약을 최대한 없앤다. 웹 검색 결과에는 Exa 요약의 근거 목록(아래 결과와 겹치는 제목·URL)을 넣지 않는다.
- **2026-11-18** — Career 추천 답변: 어떤 의도로 무엇을 얼마나 찾았고 중간에 어떻게 판단했는지는 필요할 때 말한다. 추천 뒤에는 의도 있는 질문이나 Harper가 다음에 해 줄 일(직접 연락할 방법 찾기, 팔로우하다 소식 알리기, 지원까지 진행 등)을 말한다. 모를 수 있는 정보(예: 연봉 미확인)는 매번 말하지 않는다. 필요하면 찾아보고, 아니면 말하지 않는다. 추천 개수와 형식은 상황을 보고 LLM이 정한다(급하면 많이, 방향을 확인하려면 두 개를 주고 고르게 하는 등). 고정 개수·고정 양식을 유도하는 입력을 두지 않는다.
- **2026-11-18** — Career 채팅에서 기회 찾기나 지원처럼 길어질 작업은, 진행 상황을 체크리스트로 보여 줄 수 있게 한다. 만들지 여부와 항목 추가·문장 수정·진행 중·완료·삭제는 모두 LLM이 `upsert_plan`으로 한 항목씩 정한다. 응답이 오래 걸릴 것 같거나 단계가 3개 이상일 때만 만들도록 도구 설명에 적는다(2026-11-19). 체크리스트는 툴 로그와 별개 UI이며 한 응답(turn) 동안만 유지한다. 별도 저장이나 다음 turn context는 두지 않는다. [구현](src/lib/career/turnPlan.ts)
- **2026-11-18** — Career 온보딩 자료 단계에서 링크·이력서를 하나도 넣지 않고 넘어가면 분석(읽는) 화면을 거치지 않는다. 대신 "간단하게라도 어떤 일을 해오셨는지 알려주세요"라며 바로 직접 입력을 받는다. 이 화면은 건너뛸 수 있다. "자료를 불러오지 못했어요" 안내는 실제로 넣은 자료를 읽지 못했을 때만 보여 준다. 자료와 무관한 서버 오류는 자료 실패로 표시하지 않는다.
- **2026-11-18** — 모델 입력에서 바뀔 수 있는 내용은 캐시가 유지되는 부분 뒤에 둔다. 한 응답 안에서 바뀌는 블록(매칭 노트, 마지막 단계 안내 등)은 대화 뒤 마지막 cache breakpoint 다음에 보내고, 현재 시각은 응답 시작 시각으로 고정해 system 맨 끝에 둔다. 바뀌는 정보를 빼서 해결하지 않고 위치로 해결한다. 새 prompt 블록·도구 결과를 추가할 때도 이 순서를 확인한다. [구현](src/lib/talentOnboarding/llm.ts)
- **2026-11-18** — 후보자 랜딩 `/`(`/ko`, `/en`)는 `/temporal_index` 디자인(`src/components/landing/temporal/`)으로 바꾼다. 2026-11-17 항목의 "기존 `/`는 건드리지 않는다"는 이 항목으로 대체한다. `src/pages/index.tsx`는 화면만 새 섹션으로 바꾸고, 메타·hreflang·구조화 데이터, 유입·실험 기록(`useCareerLandingStart`, 지표 노출 실험, 이메일 먼저 받기 실험, 추천인 캡처, 메인 문구 쿠키)은 하나도 빠뜨리지 않는다. "Google로 시작하기" 버튼도 Google 로그인을 바로 열지 않고 기존 시작 경로(`/career_login?next=…&source=…&lid=…&ab=…`)로 보낸다. 로그인 페이지 방문과 그 페이지의 동의·앱 안 브라우저 안내를 그대로 거치게 하기 위해서다.
- **2026-11-19** — 외부 공고 카드의 피드백 버튼은 A안(따봉 아이콘)으로 확정했다. 11/4~11/19 실험에서 열람 대비 클릭률이 A 17.7%, B(숨기기 / 저장) 10.7%였다. B안 분기와 실험 로그(`career_history_feedback_actions_*`)는 제거했고, `/ops/debugging/ab-tests`에는 종료된 실험으로 남긴다.
- **2026-11-19** — `/career` 모바일에는 설정 버튼을 따로 두지 않는다. 상단 프로필(아바타)을 누르면 바텀시트가 아니라 별도 페이지(`/career/me`)로 이동한다. 이 페이지가 계정·내 정보·자료·원하는 조건·관심 회사·기회 설정·문의·About·로그아웃을 모두 담은 전체 메뉴이고, 계정·기회 설정도 같은 페이지 안에서 연다. 설정 하위 화면과 같은 `GroupedList` 구성을 쓴다. 데스크탑은 설정 버튼과 프로필 드롭다운을 그대로 둔다.
- **2026-11-19** — Career 채팅에서 Enter는 진행 중인 턴에도 바로 보낸다(실행 중 입력으로 반영). Cmd(Windows는 Ctrl)+Enter는 진행 중인 턴이 끝난 뒤 보낼 메시지로 입력창 위에 쌓고, 턴이 끝나면 하나씩 보낸다. 보내기 전에 ✕로 뺄 수 있고, 중단하면 쌓인 메시지도 함께 비운다. 큐는 화면 상태로만 두고 저장하지 않는다. [구현](src/components/career/chat/CareerComposerSection.tsx)
- **2026-11-19** — 실제 인물 LinkedIn을 쓰는 Career 대화 테스트(페르소나 테스트)는 테스트 계정으로만 한다. 계정은 가입 전에 `talent_test_accounts`에 등록하고 `.test` 같은 수신 불가 예약 도메인 이메일을 쓴다. 등록된 계정은 DB가 `dont_share`로 고정하고 Career 일정을 멈추며 큐 메일을 취소한다. 앱은 Slack 알림, 발신 메일, 메일·지원서·캘린더 같은 외부 실행, ops 목록·지표, 회사용 외부 탐색의 회원 링크에서 이 계정을 뺀다. 매 실행은 `career_persona_test_runs`에 사람·기록 이름과 함께 등록하고, 체크리스트 판정과 근거, 숫자, 추천, 대화 전문을 `report_markdown` 하나에 저장한다. 결과는 dev controls의 ‘페르소나’로 그 계정에 로그인해 화면 그대로 보고, 평가는 홈 맨 아래에서 본다. 배포된 빌드에서는 이 전환 기능이 꺼진다. [격리 migration](supabase/migrations/20261119150000_talent_test_accounts.sql) · [API](src/app/api/talent/dev-personas/route.ts)
- **2026-11-19** — 매칭 노트를 둔 목적은 세 가지다. 대화 기록과 별도로 무엇을 왜 했는지 남겨 중복 작업을 줄이고 깊이 고민한 판단을 다시 쓰는 것, 예전 추천의 이유를 기억하고 사용자 반응을 보고 스스로 판단을 고치는 것, 찾았지만 이번에 보여 주지 않은 기회를 다음 요청에서 다시 꺼낼지 LLM이 판단하게 하는 것이다. 이런 판단은 규칙으로 만들지 않는다. 같은 기준을 매칭에만 두지 말고 지원·연결·예약·팔로우에도 하나의 구조로 적용하는 방향을 검토하고, 반응·선호를 Memory·Brief·노트·추천 판단 중 어디에 둘지 기준을 함께 정한다. [조사 노트](../research_notes/에이전트%20기억과%20작업%20기록%20설계/harper_current_state.md)
- **2026-11-19** — "좋은 기회를 어떻게 추천할까"만 다루는 정본을 [docs/career-good-opportunity-recommendation-ko.md](docs/career-good-opportunity-recommendation-ko.md)에 둔다. 추천에 관한 토론으로 생각이 바뀌면 이 문서의 해당 절과 '바뀐 생각' 기록을 고친다. 추천 관련 설계·구현·리뷰 의견은 이 문서를 먼저 읽고, 어느 주장에 기대거나 부딪치는지 밝혀 낸다.
- **2026-11-19** — 작업 기록만큼 Harper 자신의 사고 과정도 남아야 한다. "이런 이유로 이 방향을 제시한다" 같은 판단을 한 번 정하면 다음 대화와 실행에서 참고하고, 새 근거가 생기면 고칠 수 있어야 한다. 기록·기억 구조를 설계할 때 이 판단이 어느 범위(한 탐색 안, 여러 탐색을 넘어)에 남고 어떻게 다시 읽히며 고쳐지는지를 함께 정한다.
- **2026-11-19** — Career에서 회사 자체를 추천할 때 그 회사 사람에게 닿는 경로를 전제 조건으로 요구하지 않는다. 경로 찾기는 추천 뒤 Harper가 할 일이다. 닿을 수 있다는 근거는 회사가 이런 사람을 원할 근거(채용 확대, 팀 증가, 비슷한 배경의 재직자)로 본다. [정본 2.13](docs/career-good-opportunity-recommendation-ko.md)
- **2026-11-19** — 앞으로의 설계는 두 정본을 중심으로 한다. 구조는 [Career harness](docs/career-agent-harness-ko.md), 좋은 기회를 찾는 법은 [좋은 기회를 어떻게 추천할까](docs/career-good-opportunity-recommendation-ko.md)다. 사용자가 말하는 내용은 두 문서에 나눠 반영한다. 논의·구현·수정을 할 때마다 두 문서를 먼저 읽고, 바뀐 것은 해당 절과 '바뀐 생각'에 고친다. 같은 날 토론한 통합 '일' 테이블안(1판)과 노트 주인 일반화안(2판)은 그대로 적용하지 않는다.
- **2026-11-19** — note를 만든다. note는 큰 단위의 주요 작업(보통 기회 탐색이나 지원 과정)을 묶어 기억하고 나중에 참고하려고 남기는 글이다. `think`(Harper의 생각)와 `work`(작업 기록)로 나뉜다. 단위는 고정하지 않으며, 회사 한 곳 조사 정도는 note로 남기기에 작다. 매칭이나 회사에 연결할 수 있지만 필수가 아니고, 나머지는 `title`·`content`와 기본 열뿐이다. 모델에는 최근 note N개의 날짜·제목과 전체 개수를 기본으로 넣고, `read_*`·`upsert_*`로 목록과 본문을 읽고 쓴다. 같은 날의 "같은 기준을 매칭에만 두지 말고…" 항목을 이 항목이 구체화한다. [harness 4.1](docs/career-agent-harness-ko.md)
- **2026-11-19** — Memory를 특정 회사에 연결할 수 있게 한다(`relate_id` 같은 연결 열). 연결해도 원래 보이던 곳에서 그대로 보인다. 회사 정보를 읽어 평가 입력이나 결과로 LLM에 줄 때는 그 회사에 연결된 Memory를 항상 join해 함께 넣는다. [harness 4.2](docs/career-agent-harness-ko.md)
- **2026-11-19** — `company_roles`, `company_workspace`, `company_db`는 시장의 일부만 담는다. 기회를 찾을 때는 색인 밖에도 기회가 있다고 보고, 웹에서 찾은 회사를 함께 평가하거나 색인에서 못 찾았을 때 넓힌다. 공고 없는 회사는 회사 정보와 채용 신호(공고는 없지만 사람을 뽑을 것으로 보이는 근거)로 추천하고 지원 방법을 함께 안내한다. 어떤 사용자를 위해 찾았든 회사·공고·회사 정보·공개 연락 경로는 중앙에 쌓는다. 회사 정보의 기본은 개요와 채용 신호이고, 없거나 오래됐으면 평가 전에 병렬로 채운다. [정본 2.7·2.14](docs/career-good-opportunity-recommendation-ko.md), [harness 4.3·4.4](docs/career-agent-harness-ko.md)
- **2026-11-19** — 지금의 매칭 노트를 새 note로 옮긴다. Harper가 쓴 생각은 그 매칭에 연결한 work note로 옮기고, 서버 실행 기록과 사용자 반응은 note에 쓰지 않는다. 이 둘은 영수증과 추천 행에 이미 남는다. 후보 풀은 매칭에 그대로 둔다. 2026-11-17의 "매칭 조사 노트는 문장별 고정 번호로…" 항목과 "매칭 노트는 그 탐색의 유일한 작업 기록으로…" 항목은 이 항목으로 대체한다. 운영 DB에 적용된 노트 반응 trigger를 거두는 일은 별도 승인을 받는다. [harness 4.1](docs/career-agent-harness-ko.md)
- **2026-11-19** — note 본문은 통째로 바꾸는 것 말고도 덧붙이기와 일부 교체로 고칠 수 있게 한다. 매칭 카드에서 이어 찾거나 그 매칭을 대상으로 한 예약이 돌 때처럼 작업 대상이 분명하면, 연결된 work note의 본문을 처음부터 넣는다. 도구 호출의 `note`·`revisitWhen` 인자는 사용자가 판단을 맡겨 없애기로 했다. 이어 갈 생각은 note 한 곳에 둔다. [harness 4.1](docs/career-agent-harness-ko.md)
- **2026-11-19** — note 본문은 사용자가 참고한 서비스의 note 화면을 기준으로 한다. 구체적인 제목과 시각, 1인칭으로 쓴 상황·해석·판단과 그 이유·한 일·사용자의 반응, 기준 시각을 밝힌 열린 일과 다시 찾아갈 참조로 이루어진다. 이 모양은 prompt에 양식으로 넣지 않고 note의 목적만 알린 뒤, 다음 요청이 note 하나로 이어 가는지 평가로 확인한다. 대화 뒤에 따로 요약하는 모델은 두지 않는다. [harness 4.1](docs/career-agent-harness-ko.md)
- **2026-11-19** — 매칭을 이어 찾을 때(매칭 카드, 그 매칭을 대상으로 한 예약) work note 본문과 함께 서버가 기록으로 계산한 탐색 요약을 처음부터 넣는다. 요약은 평가한 후보 수, 추천·반응 수, 경로별 검색 횟수와 새 후보의 최고 순위(`readPoolSummary`)에 웹 검색 횟수와 마지막 검색 날짜를 더한 것이다. Harper가 work note를 직접 읽을 때도 붙이고, note 본문에는 저장하지 않는다. [harness 4.1](docs/career-agent-harness-ko.md)
- **2026-11-19** — `/career` 데스크탑 프로필 드롭다운은 모바일 `/career/me`처럼 바탕색 위에 `GroupedList` 카드로 나눈다. 내 정보 쪽(내 정보·자료·원하는 조건·예약된 작업·관심 회사)과 서비스 쪽(문의하기·About·로그아웃)을 다른 카드에 두고, 설정 버튼은 드롭다운 옆에 그대로 둔다. 설정된 예약 작업은 관심 회사 바로 위 항목에서 본다(데스크탑은 모달, 모바일은 `/career/me` 안).
- **2026-11-19** — 사용자가 열린 질문의 판단을 맡겼다. 고친 note의 이전 글은 저장하지 않고, 목록은 최근 10개, note는 개발 화면에서만 보인다. Gmail을 읽은 대화에서 고친 note는 그 연결을 끊으면 지운다. Memory는 회사에만 연결하고, 회사 정보에는 연결된 Memory·반응·note 제목을 붙인다. Behavior Context는 회사에 연결된 Memory를 읽지 않는다. 회사 연락처는 공식 경로와 공개적으로 연락을 청한 계정만 쌓고, 채용 신호는 2주가 지나면 다시 본다. 이름만으로는 회사를 등록하지 않는다. [harness 5절](docs/career-agent-harness-ko.md), [정본 8절](docs/career-good-opportunity-recommendation-ko.md)
- **2026-11-19** — `/update-notes`에서 "Harper에게 바라는 점" 투표를 없앴다. 업데이트 노트는 실제로 배포된 변화만, 사용자가 겪는 일 중심으로 짧고 담백하게 쓴다. "~하도록 개선했습니다" 같은 틀에 박힌 문장은 피한다.
- **2026-11-19** — 가입 직후 첫 추천의 문제 네 가지를 짚었다. 공고를 하나씩 설명하고 끝나 무엇을 왜 찾아봤는지가 없다. 적절하지 않은 회사를 대충 추천한다. 개수가 늘 3~4개로 고정적이다. 말이 짧은 문장 두 개, 공고별 설명, 끝맺음의 템플릿이다. 좋은 첫 추천은 이력에서 눈여겨본 점과 그래서 살핀 방향과 이유를 말하고, 방향별로 기회를 묶어 각자 왜 특별한지 다르게 설명하며, 개수는 찾은 것과 상황에 따라 달라지고, Harper가 다음에 해 줄 일로 끝난다. 필요하면 마크다운이나 UI 컴포넌트를 쓴다. 사용자가 든 예시와 기준은 [첫 추천 평가](docs/evaluation/career-first-recommendation/README.md)에 둔다. 원하는 품질이 나올 때까지 실제 모델로 돌려 보며 고친다.
- **2026-11-19** — Career 채팅에서 LLM이 직접 쓰는 카드(`[[career_ui:{"type":"card",…}]]`)를 쓸 수 있게 한다. 카드는 제목, label·content 목록, negative·positive 버튼(버튼 글자, 누르면 사용자 답장으로 보낼 문장)으로 이루어진다. `roleId`나 `companyId`(company_workspace)를 주면 제목과 관심 버튼을 그 기록에서 채운다. 회사 카드는 `company_datas`가 있으면 `TabBoxes`로 그 자료도 카드 안에서 보여 준다. 디자인은 dev controls의 UI 미리보기 ‘카드’ 탭에서 본다. [렌더러](src/components/career/chat/inline/CareerInlineCard.tsx) · [prompt](src/lib/career/prompts/mainPrompt2.ts)
- **2026-11-19** — note의 목적은 했던 일을 기록해 나중에 같은 일을 다시 하지 않게 하는 것이다. 매칭에 연결한 note에는 탐색에서 얻은 교훈과 전체 작업의 요약을 남긴다. 웹에서 회사를 찾을 때는 Harper 회사 목록에 인터넷에서 찾아볼 만한 회사가 이미 충분히 들어 있다고 판단되거나, 더 찾으면 시간·비용이 지나치게 든다고 판단되면 멈춘다. 이름 지정 검색 결과에 이미 목록에 있던 회사 수를 사실로 보여 준다. [harness 4.1](docs/career-agent-harness-ko.md), [정본 2.4](docs/career-good-opportunity-recommendation-ko.md)
- **2026-11-19** — 배포 효과는 `/ops/update-metrics`(업데이트 지표)에서 배포 전 4주와 배포 후 주를 나란히 비교한다. 주는 배포일 KST 0시 기준 7일 단위이고, 가입 코호트 지표는 가입 후 3일이 지난 사람만 센다. 첫 항목은 가입·첫 추천 업데이트(채팅 진행, 자료 없이 시작·제출, 1인당 3일 비용·LLM 시간, 공고가 아닌 기회 추천, 첫 3일 좋아요·Harper와 지원하기, Gmail 연결, 랜딩 전환, /jobs 미연결 공고 유입의 추천)다. 배포하면 `OPS_UPDATE_RELEASES`의 `deployedOn`을 채운다. [구현](src/lib/ops/updateMetrics.ts)
- **2026-11-21** — 사용자가 외부 기회를 제외하면서 고른 "이미 지원했던 회사/역할입니다."를 저장(좋아요·진행 종료)으로 바꾸지 않는다. 다른 제외와 같이 `dislike`로 저장하고 사유를 그대로 남긴다. 디버깅·분석에서는 이 제외를 싫어요가 아니라 '좋지만 이미 지원한 기회'로 읽는다. 추천 입력(`partitionOpportunityFeedbackReasons`)과 Worker(`recommendation_signal_for_context`)는 이미 이 사유를 선호 근거에서 뺀다. [변환 제거](src/components/career/CareerHistoryPanel.tsx)
- **2026-11-23** — `/career/history` 모바일에서는 접힌 기회 카드에 좌우 안쪽 여백을 두지 않고, 상하 여백(`--career-opportunity-inset`)만 남긴다. 카드 글자와 섹션 이름은 패널 가장자리에 맞추고, 펼치기 chevron은 숨긴다. 새 기회 카드를 누르면 목록 안에서 펼치지 않고 내 기회처럼 상세 페이지로 이동한다. 이 페이지에서는 새 기회 카드와 같은 저장·넘기기·관심·지원 버튼을 보여 준다. 데스크탑은 지금처럼 목록 안에서 펼친다. [구현](src/components/career/CareerHistoryPanel.tsx)
