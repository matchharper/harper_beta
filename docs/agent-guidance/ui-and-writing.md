# UI·문구·참조 디자인 작업 계약

코드·문서 경로는 `harper_beta/` 기준이다.

## UI 문구 절제와 참조 디자인 준수 — 필수

- 사용자에게 새로운 정보나 판단 근거를 주지 않는 UI 문구는 넣지 않는다. 화면에 이미 보이는 제목·버튼·대화·배치를 다시 설명하는 라벨, 당연한 이용 조건, 장식용 슬로건, 관성적인 helper text와 버튼 아래 꼬리말은 금지한다. 빈 공간을 채우거나 친절해 보이게 하려는 이유로 추가하지 않는다.
- 문구를 지워도 사용자가 기능의 가치·현재 상태·다음 행동을 똑같이 이해할 수 있다면 삭제한다. `슬롯이 연결된 Role에서 시작할 수 있어요.`처럼 구매 화면에서 설명할 조건을 기능 소개에 반복하거나, `이렇게 연결돼요 · 예시`처럼 눈앞의 콘텐츠를 해설하거나, `지민님과 Harper`처럼 대화 배치만으로 충분한 참여자 설명을 덧붙이지 않는다. 이는 해당 문자열만의 금지가 아니라 같은 역할을 하는 군더더기 전체에 적용되는 기준이다.
- 필요한 설명은 실제로 알 수 없던 기능·차이·결과를 구체적으로 전달해야 한다. 오류 원인·복구 방법, 비용·동의·공개 범위·되돌릴 수 없는 결과처럼 판단에 필요한 정보와 접근성 이름은 유지하되, 실제 필요한 위치에 한 번만 제공한다. 불필요한 설명을 tooltip이나 다른 위치로 옮겨 남겨두지 않는다.
- 사용자가 특정 화면을 디자인 참조로 지정하면 실제 구현의 정보 구조·아이콘·타이포그래피·간격·행동 배치를 확인하고 따른다. 배경색이나 분위기만 가져오고 핵심 구성을 임의로 생략하지 않는다. 참조가 기능별 아이콘 + 제목 + 설명의 세로 목록이면 같은 구조와 밀도를 재사용하며, 체크 아이콘을 반복한 한 줄 요약으로 대체하지 않는다.
- 이 규칙은 UI 작성·검토의 판단 기준이다. 예시 단어를 정규식·키워드 목록으로 검열하거나 LLM의 실제 답변을 결정론적 문구로 덮어쓰는 런타임 로직으로 구현하지 않는다.

## Company-side UX writing

- Before creating, changing, or reviewing any user-facing wording for the
  company-side LLM, `/org`, or company-facing Slack, read and follow
  `docs/company-side-ux-writing-guide-ko.md`.
- This includes generated replies, prompts that shape those replies,
  deterministic messages, notifications, buttons, modal copy, status labels,
  empty states, and errors.
- Verify the actual product behavior before changing copy. Keep equivalent web
  and Slack flows aligned, and update the guide when introducing a new recurring
  term or writing pattern.

## Conversational E2E quality

- A Slack, web-chat, demo, or E2E run is not successful merely because tools completed, data changed, or no exception occurred. Read the exact user-visible response in its full conversation and evaluate whether it fulfills the user's actual purpose. Do not turn evaluation criteria into a mandatory list of things every answer must explain.
- Reject an E2E result before handoff when the response is a mechanical receipt, loses the latest user context, exposes implementation vocabulary, overfits a fixture, repeats confirmation without a real decision, makes an unsupported delivery or Calendar claim, omits an important next step, or has an obviously poor tone. Fix the underlying prompt, context, data, or control-flow cause and rerun the scenario; do not report the run as satisfactory first and wait for the user to identify the UX defect.
- When a task explicitly asks for direct Slack or browser testing, inspect the rendered message and interaction experience as product output. Record the exact fixture scope and state transitions for safety, but judge completion primarily from the user's experience rather than logs alone.

## UI and design

- Before implementing or reviewing UI and design changes, read and follow `src/styles/Design.md`.
- Before creating UI markup or a local component, search in this order: `src/components/ui/`, `src/components/common/`, then the relevant domain directory under `src/components/`. Reuse a suitable component or established composition before creating a new primitive.
- Never reimplement modal infrastructure such as portals, overlays, focus management, Escape handling, outside-click handling, or ARIA dialog wiring in a feature component. For `/career`, use `src/components/common/TalentCareerModal.tsx`; for generic Radix dialogs, use `src/components/ui/dialog.tsx`. A local wrapper may own domain content and actions, but not modal infrastructure.
- Keep the shared-component catalog and discovery rules in `src/styles/Design.md` current whenever a new reusable UI primitive or preferred composition is introduced.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
