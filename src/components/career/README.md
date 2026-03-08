# Career UI Map

## 화면 조립
- `src/pages/career/index.tsx`
  - 페이지 레이아웃만 담당합니다.

## 상태/로직 소유
- `src/components/career/CareerFlowProvider.tsx`
  - auth/session/chat/profile/onboarding 로직을 조립하고 컨텍스트로 제공합니다.

## Chat 패널
- `src/components/career/CareerChatPanel.tsx`
  - 채팅 패널 오케스트레이션(보이스 재생 효과 + 섹션 조립).

- `src/components/career/chat/CareerTimelineSection.tsx`
  - 로그인/메시지 리스트/온보딩 카드 영역.

- `src/components/career/chat/CareerComposerSection.tsx`
  - 하단 입력 영역(텍스트/보이스 전환, 전송 버튼).

- `src/components/career/chat/CareerMessageBubble.tsx`
  - 메시지 버블 스타일 전용 파일.
  - 유저 메시지 배경색은 `USER_BUBBLE_CLASS`를 수정하면 됩니다.

## Sidebar
- `src/components/career/CareerProgressSidebar.tsx`
  - 오른쪽 진행률/프로필 패널 UI.
  - 컨텍스트에서 직접 상태를 읽습니다.

## 컨텍스트
- `src/components/career/CareerChatPanelContext.tsx`
- `src/components/career/CareerSidebarContext.tsx`
