# Shared Chat UI

`src/components/chat`에는 기존 검색/후보자 채팅과 함께 `/career`, `/org`가
공유하는 표시 전용 primitive가 있습니다. 데이터 조회, LLM 호출, tool 실행,
메시지 저장은 이 폴더에 넣지 않고 각 도메인 adapter가 소유합니다.

## Career / Organization 공통 primitive

- `ChatComposerFrame`
  - textarea와 action, mention menu 같은 overlay를 조립합니다. action은 기존 우하단
    overlay 또는 textarea 아래 footer 배치를 선택할 수 있습니다.
  - placeholder, disabled, key handler, action을 props로 바꿀 수 있습니다.
  - `/org` 역할 대화의 footer 배치에서는 textarea만 1~4줄까지 자동으로 늘어나고,
    composer 실제 높이를 메시지 스크롤 여백에 반영합니다.
- `ChatMessageBubbleFrame`
  - user의 content-sized 검은 bubble과 Harper의 평면 메시지 폭·간격을 통일합니다.
  - 본문 renderer, 앞쪽 아이콘, active/error class는 호출부가 주입합니다.
- `ChatAssistantContent`
  - `/career`와 `/org` Harper 메시지의 Markdown/GFM 렌더러를 통일합니다.
  - 제품별 내부 링크 처리와 typography는 props/class adapter로 주입합니다.
- `ChatAssistantPending`
  - assistant placeholder의 `작성 중...` 상태와 접근성 live region을 공유합니다.
- `ChatAssistantLabel`
  - 기본 Harper mark를 표시하며 필요하면 children으로 label을 교체합니다.
- `ChatDateDivider`
  - 날짜가 바뀌는 지점의 구분선입니다.
- `ChatChoiceList`
  - LLM이 제시한 선택지를 클릭 가능한 세로 목록으로 표시합니다.
- `ChatLoadOlderButton`
  - cursor 기반 이전 메시지 로딩 action입니다.
- `ChatThinkingLogPanel`
  - 진행 중에는 펼쳐지고 완료된 메시지에서는 접을 수 있는 Thinking log입니다.

`/career`의 기존 hook과 메시지 parsing은 그대로 유지하고 위 primitive에 기존
class와 callback을 전달합니다. `/org`는 `useOrgAgentMessageHistory`,
`useOrgAgentChat`, mention 조회를 adapter로 사용하므로 UI를 공유해도 두 제품의
데이터와 company-side LLM 로직은 섞이지 않습니다.

Organization의 웹과 Slack은 같은 company-side LLM 실행·저장 경로를 사용합니다.
웹 adapter만 응답 가드를 통과한 SSE text delta를 점진적으로 표시하고, Slack
adapter는 저장된 최종 답변을 Slack mrkdwn·button·link 형식으로 전달합니다.
