# harper_beta TypeScript 삭제 후보 정리 및 삭제 결과

작성일: 2026-05-18

## 기준

- 대상은 `harper_beta` 내부의 TypeScript 작성 파일 위주입니다: `.ts`, `.tsx`.
- 제외했습니다: `node_modules`, `.next`, `.playwright-cli`, `output`, public asset, 로그/스크린샷/생성물.
- 진입점으로 본 것: `src/pages/**`, `src/app/**/(page|layout|route|loading|error|not-found).ts(x)`, `src/proxy.ts`, `package.json`의 `tsx` 실행 스크립트.
- 사용자가 요청한 기준대로 “당장 삭제 후보” 중 그나마 쓸 가능성이 있어 보이는 3개만 남기고 나머지는 삭제했습니다.

## 남긴 3개

| 파일 | 남긴 이유 |
|---|---|
| `src/app/fonts.ts` | local Pretendard font 설정이라 layout에 다시 붙일 가능성이 있음. |
| `src/app/api/search/utils.ts` | 레거시지만 SQL 변환/스코어링/검색 보조 로직이 들어 있어 일부 함수 재활용 가능성이 있음. |
| `src/components/landing/Compare.tsx` | 현재는 `Compareold`가 쓰이지만 랜딩 섹션 실험/교체 후보로 재사용 가능성이 있음. |

## 삭제 완료

| 파일 | 삭제 사유 |
|---|---|
| `src/app/api/connection/bookmarktoggle.ts` | 0 byte이고 App Router API로 인식되는 `route.ts`가 아니며 참조 없음. |
| `src/lib/llm/parse.ts` | 0 byte, 참조 없음. |
| `src/styles/icon.ts` | 0 byte, 참조 없음. |
| `src/lib/server/search.ts` | `runCandidateSearch` export만 있고 참조 없음. |
| `src/lib/server/cursor.ts` | 커서 헬퍼 export만 있고 참조 없음. |
| `src/lib/opportunityDiscovery/utils.ts` | `normalizeWhitespace` export만 있고 참조 없음. |
| `src/lib/system.ts` | 오래된 진행 메시지 상수로 보이며 참조 없음. |
| `src/lib/talentOnboarding/interviewSteps.ts` | prompt re-export 호환 파일로 보이나 참조 없음. |
| `src/utils/constantkeys.ts` | 빈 `OPENAI_KEY` 포함 미사용 상수/문구 파일. |
| `src/utils/func.ts` | `scrollToTop` export만 있고 참조 없음. |
| `src/utils/pdfToMarkdown.ts` | PDF helper export만 있고 참조 없음. |
| `src/hooks/chat/useAutoScroll.ts` | hook export만 있고 참조 없음. |
| `src/hooks/useFreeCreditFeedback.ts` | free-credit feedback hook 참조 없음. |
| `src/hooks/useToggleBookmark.ts` | bookmark mutation hook 참조 없음. |
| `src/store/useCareerStore.ts` | Zustand store 참조 없음. |
| `src/store/useHistoryStore.ts` | Zustand store 참조 없음. |
| `src/components/Modal/CandidateModal.tsx` | 모달 컴포넌트 참조 없음. |
| `src/store/useCandidateModalStore.ts` | 미사용 `CandidateModal.tsx` 전용 store. |
| `src/components/Modal/RevealConfirmModal.tsx` | placeholder 모달이고 참조 없음. |
| `src/components/Modal/RequestCreditModal.tsx` | request credit 모달 참조 없음. |
| `src/components/ExperienceTimeline.tsx` | UI 컴포넌트 참조 없음. |
| `src/components/TypeWriterText.tsx` | UI 컴포넌트 참조 없음. |
| `src/components/information/LinkPills.tsx` | UI 컴포넌트 참조 없음. |
| `src/components/call/HarperCircle.tsx` | call UI 컴포넌트 참조 없음. |
| `src/components/call/Timer.tsx` | call UI 컴포넌트 참조 없음. |
| `src/components/layout/CreditNav.tsx` | placeholder 컴포넌트이고 참조 없음. |
| `src/components/layout/NotExistingPage.tsx` | Next 특수 진입점이 아니고 참조 없음. |
| `src/components/ui/BeigeCheckbox.tsx` | beige checkbox wrapper 참조 없음. |
| `src/components/ui/beige-action-dropdown.tsx` | beige action dropdown wrapper 참조 없음. |
| `src/components/ui/career/BeigeButton.tsx` | career beige button wrapper 참조 없음. |
| `src/components/landing/VCLogos.tsx` | 현재 `VCLogosWidth`가 사용되고 이 파일은 참조 없음. |
| `src/components/landing/SectionLayout.tsx` | 현재 `GridSectionLayout`/`BaseSectionLayout`이 사용되고 참조 없음. |
| `src/components/landing/Animation/Fadein.tsx` | 현재 `Animation/Reveal` 또는 `Animate`가 사용되고 참조 없음. |
| `src/components/landing/RotatingWord.tsx` | 랜딩 텍스트 컴포넌트 참조 없음. |

## 계속 보류

| 파일/그룹 | 보류 이유 |
|---|---|
| `src/components/ui/calendar.tsx`, `card.tsx`, `chart.tsx`, `table.tsx` | 현재 git 상태상 새로 추가된 untracked 파일이고 shadcn류 기반 컴포넌트라 제외. |
| `src/components/ui/dialog.tsx`, `responsive-dialog.tsx` | dialog 계열 공용 primitive라 재사용 가능성이 있어 제외. |
| `src/components/career/DeliveryCopyPromptTestPanel.tsx`, `src/lib/career/deliveryCopyPromptTest.ts` | 명시적으로 prompt test/dev 용도라 보존 의도가 있을 수 있어 제외. |
| `src/lib/talentOnboarding/reengagement.ts` | active feature 이름과 맞물려 있고 관련 route/hook가 살아 있어 제외. |
| `src/components/apply/ProfileResume.tsx`, `src/states/useUploadProfile.ts`, `src/states/useUserProfile.ts`, `src/store/useProfileStore.ts` | resume/profile apply 흐름은 제품 기능으로 다시 붙을 가능성이 있어 제외. |
| `src/components/career/profile/CareerHarperInsightsSection.tsx`, `src/components/career/ui/CareerLinkInputRow.tsx` | career README에 구조상 언급되어 있어 리팩터 예정/문서화된 파일일 수 있어 제외. |
| `src/types/svg.d.ts` | TypeScript 모듈 선언 파일이라 삭제 후보에서 제외. |
