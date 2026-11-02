# Harper Repository Instructions

공통 설계·검증·권한 경계는 [Workspace Instructions](../AGENTS.md)를 따른다. 아래는 웹 프로젝트에 필요한 경로와 작업별 계약이다.

## 프로젝트 계약

- `/org`와 회사 Slack에서 응답하는 원본 모델은 **company-side LLM**으로 부른다. 코드 주석·문서·구현 논의에서 같은 용어를 사용한다.
- `origin/main` push는 운영 Vercel 배포를 유발한다. 현재 요청의 명시적인 배포 승인 없이 push하지 않는다. 일반 운영 배포는 Git-triggered 경로를 사용하고 배포 revision을 확인한다.
- 배포와 실제 가격·운영 정책 변경의 Notion 동기화는 [배포 계약](docs/agent-guidance/release.md)을 따른다. 로컬 구현을 운영 동작으로 문서화하지 않는다.

## 작업별 문서

해당 작업에 적용할 문서를 먼저 읽는다. `agent-guidance` 문서 안에 연결된 기존 기능별 정본도 해당 절에 따라 읽는다.

| 작업 | 계약·정본 |
| --- | --- |
| LLM prompt·context·tool·formatter·schema | [LLM 설계·입력·검증](docs/agent-guidance/llm-engineering.md) |
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
