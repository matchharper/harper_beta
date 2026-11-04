# Career 채팅 인라인 UI — 로컬 구현과 가이드 연결 계획

2026-11-04. 렌더링과 기존 데이터/액션 연결을 구현했다. 이 문서의 LLM 가이드는 제안이며 실제 prompt에는 적용하지 않았다.

## 구현한 표시 계약

assistant의 웹 채팅 본문에서 독립된 한 줄을 해석한다. 앞뒤 설명과 UI의 순서를 유지하며, 세 UI 모두 내용을 바로 펼쳐 보여준다. 문서 preview의 `rounded-3xl bg-black/4` 표면만 사용한다.

```text
[[career_ui:{"type":"matching","matchingId":"<실제 UUID>"}]]
[[career_ui:{"type":"matching","matchingId":"<실제 UUID>","runId":"<실제 실행 UUID>"}]]
[[career_ui:{"type":"opportunities","scope":"saved"}]]
[[career_ui:{"type":"opportunities","scope":"progress"}]]
[[career_ui:{"type":"opportunities","scope":"all"}]]
[[career_ui:{"type":"opportunities","roleIds":["<실제 role UUID>"]}]]
[[career_ui:{"type":"brief"}]]
```

| UI | 데이터와 동작 |
| --- | --- |
| 매칭 결과 | 기존 matching 결과 API. 추천된 포지션 포함/제외, 페이지 조회, 상세 열기, 외부 공고 저장/취소. `OpportunityCard`를 내 기회·새 기회와 공유한다. `runId`가 있으면 해당 실행으로 조회 범위를 고정한다. |
| 기회 모음 | `scope`는 현재 사용자의 저장함/진행중 또는 둘의 합집합이다. 기존 history 상태와 페이지 조회를 공유한다. `roleIds`는 사용자의 기회 이력 중 명시한 항목을 순서대로 묶는다. 저장 목록은 `SavedOpportunityList`, 진행 목록은 `ProgressOpportunityRow`를 사용한다. 지원은 기존 상세/지원 선택 동작에 연결한다. |
| 원하는 조건 | 현재 Search Brief를 `CareerTalentContextSection`으로 표시한다. 추가/수정/저장도 기존 context mutation을 사용한다. 과거 메시지에서 열어도 현재 조건이다. |

표시 참조 자체는 추천·저장·지원·조건 변경을 실행하지 않는다. 기존 상세 열기나 버튼을 통한 액션에는 기존 제품 계약이 적용된다. 새 LLM tool, 테이블, 별도 UI 상태 persistence는 없다.

## 조회·스트리밍 경계

- `inlineUi.ts`가 식별자와 UI 종류를 파싱하고 `CareerMessageBubble`이 본문 사이에 렌더링한다. 사용자 메시지, 코드 블록, 인용문 속 예시는 실행하지 않는다. 스트리밍 중 미완성 참조는 숨기고, 완성된 잘못된 참조는 unavailable 표시로 끝낸다.
- `messageType`이 웹 채팅일 때만 UI를 마운트한다. mail/call 등 비웹 메시지의 참조는 표시/조회하지 않는다. 이메일 전송·TTS·모델 이력 projection까지 연결한 것은 아니다.
- 매칭은 기존 React Query cache와 cursor를 공유한다. 명시한 기회는 기존 history 페이지 크기인 10개씩 묶어 조회하며 같은 참조는 cache를 공유한다. 카드별 요청이나 polling을 추가하지 않는다.
- 매칭 API는 로그인 사용자 소유의 matching과 선택한 run의 소유권/소속을 확인한다. 기회 batch GET은 로그인 사용자의 기존 이력만 반환하며 열람·추천·feedback·archive를 기록하지 않는다. 일부 항목을 조회할 수 없으면 이를 표시한다.
- 매칭 사유는 기존 사용자용 `recommendationNote`/`recommendationSummary`가 있을 때만 표시한다. private assessment를 그대로 노출하거나 표시 단계에서 새 사유를 만들지 않는다.

현재 매칭 reader는 외부 공고 평가를 조회하며 만료 공고를 제외한다. 추천 여부도 기존 추천 이력 기준이다. 따라서 내부 Role·만료 공고까지 포함한 모든 과거 평가, 특정 실행 당시의 추천 여부/공고 내용 snapshot을 구현했다고 해석하면 안 된다. 예시 화면의 사유는 synthetic fixture이며, 실제 미추천 공고에 설명이 없으면 사유 행이 생략된다.

## LLM 가이드 연결 계획 — 미적용

1. **원본 웹 표시 계약을 수정한다.** `src/lib/career/prompts/mainPrompt2.ts`의 `careerTextChatDisplayRules`에서 기존 개별 `[posting](roleId)` 설명을 확장한다. 개별 공고는 기존 카드, 매칭/기회 목록/조건은 위 참조를 사용할 수 있음을 설명한다. 별도 렌더링 tool이나 새 능력 registry 항목은 만들지 않는다.
2. **모델에는 표시 의도와 최소 참조만 맡긴다.** 매칭 ID는 현재 resource index 또는 기존 `list_matchings`/조회 결과에서 가져온다. 특정 실행이면 조회 결과의 실제 run ID를 쓴다. 기회 제목·상태·조건 전문을 JSON에 복제하지 않는다. 설명이나 판단에 데이터가 필요하면 기존 read 도구로 읽고, 표시만 필요한 목록은 UI가 읽는다. 추천 실행은 계속 기존 `upsert_opportunities` 등의 실행 경로가 담당한다.
3. **채널에 맞춰 제공한다.** `conversationPlan.ts`의 `career_chat_display`는 현재 메인 웹 채팅에만 들어가고, 이메일 `adaptEmailPromptBlocks`는 이미 이 block을 제거한다. 연결할 때 온보딩·백그라운드 완료 등 웹 전달 경로도 실제 출력 채널을 기준으로 확인한다. 음성·메일에는 넣지 않는다. 저장된 웹 대화가 음성/메일 context·요약·후속 호출로 넘어가는 경로도 확인하고, 표시 참조를 해당 채널의 사실 projection으로 처리한다. 웹 원본 메시지는 재렌더링을 위해 유지한다.
4. **실제 모델 입력과 화면으로 확인한다.** 자유로운 요청에서 모델이 알려진 ID를 선택하는지, 불필요한 read 없이 표시할 수 있는지, 설명에 필요한 사실은 읽는지 확인한다. 기존 개별 공고·Gmail·document와 함께 사용할 때의 순서, professional/friendly 모드, 스트리밍·새로고침·음성·이메일을 확인한다. 프롬프트 문자열 검사만으로 완료 판정하지 않는다.

추가할 가이드의 초안:

> 웹 채팅에서는 기존 Career 데이터를 본문 중간에 펼쳐 보여줄 수 있다. 매칭 검토 목록에는 matching 참조, 저장/진행중 또는 특정 기회 묶음에는 opportunities 참조, 현재 원하는 조건에는 brief 참조를 독립된 한 줄로 사용한다. 매칭과 기회의 식별자는 context나 조회 결과에 있는 실제 값을 사용한다. 참조는 저장된 데이터를 보여주는 것이며 추천·지원·조건 변경을 실행하거나 그 사실을 증명하지 않는다. 어떤 UI가 사용자 목적에 도움이 되는지와 주변 설명은 대화 맥락에 따라 판단한다.

실제 적용 시 위 설명에 정확한 marker 문법과 scope 의미를 함께 둔다. 특정 질문에 대한 정해진 답변이나 필수 사용 횟수는 추가하지 않는다.

## 로컬 확인

- `/career/preview/chat-ui`는 synthetic reader/action을 주입한 **실제 메시지 parser와 renderer**를 사용한다. production에서는 404다.
- parser·API 경계 테스트 13개와 message/render 통합 테스트 12개를 실행했다. React 테스트는 로컬 dummy Supabase/LLM 환경변수와 CSS module loader로 실행하며 외부 서비스에 연결하지 않는다.
- 변경 소스의 TypeScript 진단과 새 renderer/parser/preview의 ESLint를 확인했다. 브라우저에서는 더보기·추천 제외 필터·저장 후 목록 반영·Brief 편집 저장과 데스크톱/390px 모바일 표시를 확인했다.
- LLM 출력 생성, 운영 데이터 변경, 이메일 발송, 배포는 이번 확인 범위에 포함하지 않는다.
