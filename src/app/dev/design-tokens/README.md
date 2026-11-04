# Design token preview and validation

2026-11-04. 외관 변수화 작업. 첨부된 미래 디자인은 방향을 참고했으며 레이아웃이나 제품 기본값을 글래스 프리셋으로 전환하지 않았다. 배포하지 않았다.

## 실행과 변경

기존 개발 서버에서 `/dev/design-tokens`를 연다. 별도 포트가 필요하면 저장소 루트에서 실행한다.

```sh
HARPER_E2E_DIST_DIR=.next-design node node_modules/next/dist/bin/next dev --port 3104
```

production에서는 `notFound()`다. 실제 공용 컴포넌트를 사용하는 로컬 화면이며 서버 요청·DB 저장·실제 메시지 전송이 없다. 기본/평면/글래스 버튼은 root CSS 변수만 바꾼다. `변수 직접 조정`에서 공통 표면과 개별 컴포넌트의 값을 입력하고, 기본값 버튼으로 전체 override를 해제한다. 화면을 나갈 때 이전 root 속성/inline 값을 복구하며 브라우저에 선택을 저장하지 않는다.

- 팔레트·페이지 색상: `src/globals.css`
- 공통/컴포넌트 외관: `src/styles/design-tokens.css`
- QA 전용 프리셋: 이 폴더의 `preview.css`
- 사용 계약: `src/styles/Design.md`, `src/components/ui/README.md`

공통 surface 값을 변경하면 이를 참조하는 컴포넌트가 함께 변한다. modal/menu/control/button/composer 등 최종 변수를 지정하면 해당 역할만 분리할 수 있다. 배경색과 배경 이미지는 독립 속성이다. 글로벌 변경은 `:root`에 적용해야 body 포털에도 전달된다. 하위 요소만 변경할 때는 최종 컴포넌트 변수를 지정한다. 그림자는 `shadow-(--shadow-card)`처럼 원래 변수를 직접 읽는다.

## 적용 범위

공용 Button/MuteButton/CardButton, Card/Panel, Input/TextField/Textarea, Select/Combobox/CompactDropdown, Checkbox/Radio/Switch, Dialog/TalentCareerModal/기존 BaseModal, DropdownMenu와 하위 메뉴, Popover/Tooltip, Toast, Tabs/Badge, 대화 입력창·메시지 표면을 연결했다. 기본 외관을 덮던 사용처도 정리했다. Career/Org/공개 화면/관리·운영 화면의 고정 색·모서리·그림자를 의미 또는 기초 토큰으로 옮겼고, 그리드·차트 tooltip·legacy glass·일부 장식 패턴도 같은 CSS 원본에서 조정한다.

일반 카드·모달과 기회 목록의 외관은 구분한다. `OpportunityCard`는 기존 접힘/펼침 배경과 옅은 테두리를 유지하며 기본 그림자가 없다. 화면 배치와 업무 흐름은 유지한다. 모든 표면에 같은 처리를 강제하지 않는다. 평면 side panel, 투명 action, 상태색 등 명시적인 역할은 그에 맞는 변수/override를 사용한다.

사진·로고·외부 브랜드 SVG, 실제 이메일 원문을 표시하는 격리 iframe, 사용자가 저장하는 색상 데이터와 `input[type=color]` 값은 제품 테마로 치환하지 않았다. 원형 아이콘·avatar의 기하, 레이아웃 크기·간격·애니메이션 시간은 이 외관 변경의 대상과 구분했다. 기존 Tailwind scale도 CSS 변수이므로 모든 모서리에 개별 새 토큰을 만들지는 않았다.

## 브라우저에서 확인한 결과

로컬 Chromium, desktop 1440×1000 / mobile 390×844. 공용 UI preview와 기존 `/dev/career-opportunities`의 **현재 방식**을 사용했다. Career 화면은 실제 workspace/list/card/composer에 합성 데이터를 넣은 화면이며 운영 계정·실제 데이터의 end-to-end 검증은 아니다.

| 변경 | 실제 computed style 결과 |
| --- | --- |
| 카드 기본 → 평면 → 글래스 | radius 12px → 4px → 22px, blur 0px → 0px → 24px |
| 글래스 표면 | rgba(255,255,255,.52) + 독립 gradient + inset/elevation shadow |
| 평면 버튼 | 기존 그림자 제거; 글래스에서는 새 shadow 반영 |
| 공통 border 두께 3px | 카드·모달·Select 포털 표면에 3px 반영 |
| 서로 다른 카드/모달/메뉴 배경 | #fff1e6 / #f3f5ff / #eef9f1 각각 반영 |
| 모달만 radius 6px | 카드·메뉴 모서리와 독립적으로 반영 |
| 제목 굵기 700 | CardTitle computed font-weight 700 |
| 서로 다른 foreground | 카드 제목, Input/TextField/Select, composer, 모달 제목, menu item 각각 지정한 RGB 반영 |
| 모바일 바텀시트 | 너비 390px, 아래 끝 844px, 상단 radius 32px·하단 0px, blur 24px |
| 실제 Career 모바일 | 91개 합성 기회가 있는 현재 UI에서 viewport/문서 너비 모두 390px |

Select와 모달 안 Select의 값 변경, DropdownMenu/submenu, Popover 입력, Tooltip, 탭·체크박스·Switch, disabled 입력, 로컬 전송·Toast를 조작했다. 모달 내부 포커스, Escape로 메뉴/모달 닫기, 모바일 닫기와 overflow를 확인했다. 정의한 외관 토큰이 브라우저에서 빈 값으로 빠지는지도 확인했다.

검증 중 수정한 주요 누락:

1. `tailwind-merge`가 배경색과 사용자 정의 배경 이미지를 같은 그룹으로 취급해 하나를 제거함 → shared `cn`에 이미지와 font/radius 등의 그룹을 등록하고 두 import 경로를 통합.
2. Tailwind가 shadow alias를 컴파일 시 풀어 일부 런타임 변경이 적용되지 않음 → 원래 shadow 변수 직접 참조.
3. callsite의 기본 bg/radius/shadow와 Select·CompactDropdown·composer·카드/모달 제목의 기존 text 색이 컴포넌트 변수를 덮음 → 중복 override 제거 및 올바른 역할에 연결.
4. 실제 OpportunityCard와 TextField, legacy composer의 개별 표면 → 공용 역할로 연결.
5. legacy liquid-glass의 선언된 변수 미사용과 fallback cascade → 변수 사용 및 fallback 순서 수정.

## 코드 확인

다음 변경 경로 테스트 20개 통과. 기회 카드 테스트가 import 시 클라이언트 환경변수를 요구하므로 외부 서비스가 아닌 dummy loopback 값을 사용했다. 테스트 자체는 요청을 stub한다.

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=design-token-unit-test \
node --import tsx --test \
  src/lib/cn.test.ts \
  src/components/chat/ChatComposer.test.tsx \
  src/components/chat/messageBubbleLift.test.ts \
  src/components/ui/document-editor.test.tsx \
  src/components/ui/tab-boxes.test.tsx \
  src/components/career/history/NewOpportunityCard.feedback.test.tsx
```

TypeScript `tsc --noEmit --incremental`와 변경 핵심 파일의 ESLint, `git diff --check`를 확인했다. 전체 제품 테스트·production build·모든 페이지/브라우저의 시각 검증을 수행한 것은 아니다.

추가로 실행한 `sharedCareerUiContract.test.ts`는 6개 중 4개 통과, 기존 문자열 검사 2개 실패다. OrgAgentMessage의 `logs={message.thinkingLogs}`와 CareerMobileNavigationMenu의 `rounded-full bg-action` 문자열 기대가 작업 전 snapshot에도 존재하지 않는 것을 확인했다. 이번 변수화의 radius 기대값은 갱신했고, 관련 없는 두 기존 기대/업무 코드는 변경하지 않았다.

로컬 검증 산출물은 `.local/design-token-validation/`에 보관한다. `current/flat/glass-desktop.jpg`, `glass-modal-desktop.jpg`, `glass-sheet-mobile.jpg`, `career-glass-desktop.jpg`, `career-glass-mobile.jpg`와 computed style JSON, 검사 로그가 있다. 이 폴더는 git에 포함되지 않는다.

## 2026-11-05 기본 외관 복원

변수화 과정에서 불필요하게 바뀐 기본값을 수정했다. `TabBoxes neutral`의 글자 굵기는 기존 400, 비선택 배경은 black 4%로 복원했다. 새 기회·저장함·진행중이 공통으로 사용하는 `OpportunityCard`는 `opportunity` 변수군으로 분리해 접힘 #fafafa / 펼침 #ffffff, 기존 옅은 테두리와 12px 모서리, 그림자 없는 기본값을 유지한다. 일반 카드의 shadow 변경이 기회 목록에 새 그림자를 추가하지 않는다. 변수 연결은 유지한다.

수정 후 세 탭의 실제 공용 기회 카드와 탭 굵기를 로컬 Career preview에서 확인했다. 기존 글래스 스크린샷은 최초 변수화 검증 기록이며 현재 기본 디자인의 정본이 아니다. 복원 화면·computed style은 `.local/design-token-validation/correction/`에 기록한다.
