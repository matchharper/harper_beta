# 2026-10-21 /org UI 작업 — 요청 범위를 벗어난 변경과 복원 목록

작성일: 2026-10-21 · 상태: 사용자 선택 7개 항목 복원 완료, 6개 항목 현재 상태 유지

> 2026-10-22 후속 요청으로 Free 열람 차감·블러·LLM 정보 제한을 제거했다. 아래의 “별도 Free 열람·잠금 변경 보존”은 10월 21일 UI 복원 작업의 범위 기록이며, 폐기한 기능을 유지하거나 재도입하라는 현재 지침이 아니다. 현재 정책과 적용 상태는 [구독 구현 문서](workspace-billing-stripe-setup-ko.md)를 따른다.

**최종 지시 반영:** “R5, r7, r8, r9, r11, r12 는 두고 나머지는 복원해”에 따라 R01·R02·R03·R04·R06·R10·R13만 복원했다. R05·R07·R08·R09·R11·R12는 변경하지 않았다. 아래의 변경 전후 설명과 코드 줄 번호는 최초 조사 시점의 기록이다.

이 문서는 “/org company-side의 UI / UX를 수정하려고 해. 근데”로 시작한 채팅에서 만든 변경만 조사한다. 사용자의 “완성도를 더 높여”는 그날 요청한 새 UI의 디자인·UX·문구를 개선하라는 뜻이었다. 기존 회사 제품의 모든 화면과 문구를 다시 디자인하라는 뜻으로 확대 해석한 것이 잘못이었다.

**최초 조사에서 복원 후보를 13개 묶음으로 정리했다.** Intro 모달 제목뿐 아니라 기존 모달의 설명, 기존 버튼 문구·스타일, Slack 연결 안내, 채팅 빈 화면, Role 인박스에서 누락된 정보가 포함된다. 프로필 분리 과정에서 빠진 기존 모바일 액션도 포함한다. 실제 복원 여부는 아래 최종 처리 열을 따른다. 요청한 기능과 이후 명시적으로 허용한 디자인은 유지한다.

## 1. 조사 기준

| 구분 | 기준 |
| --- | --- |
| 저장소 | `/Users/gimhojin/Desktop/harper/harper_beta` |
| 작업 브랜치 | `codex/org-inbox-review-ux` |
| 작업 전 기준 | `e97850a6` |
| 이 채팅의 마지막 구현 커밋 | `296269eb` |
| 비교 범위 | 위 두 커밋 사이 9개 커밋, 48개 변경 경로. CSS 파일명 변경은 1개로 계산 |
| 현재 상태 확인 | 해당 변경이 현재 로컬 코드에도 남아 있는지 확인 |
| 근거 | 사용자 원요청과 후속 수정 지시 → 작업 전 코드 → 작업 커밋 → 현재 코드 순으로 대조 |
| 검증 한계 | 코드·호출 경로·변경 이력 조사. 이번 조사에서 브라우저 시각 검증이나 실제 후보자 액션 실행은 하지 않음 |

현재 작업 폴더에는 Free 후보자 열람, 결제, 오류 처리, 후보자 이메일 공개 범위 등 별도 변경도 함께 있다. 그 변경들은 이 채팅의 9개 커밋에 포함되지 않으므로 **이 문서에서 미승인 변경으로 판정하거나 복원 대상으로 삼지 않았다.** 같은 파일 안의 별도 변경도 보존해야 한다. 아래 파일 링크의 줄 번호는 조사 시점의 로컬 파일 기준이며, 복원 원문은 `e97850a6`에서 확인한다.

| 커밋 | 시각(KST) | 이 채팅에서의 변경 |
| --- | --- | --- |
| `ac38bdd6` | 14:59 | Home/Role 인박스와 후보자 검토 화면 최초 구현 |
| `7327c8fb` | 15:24 | 디자인·문구 정리. 이번 복원 대상 다수가 여기서 발생 |
| `cfbf9363` | 17:05 | 기존 프로필 디자인 복구, Grid 추가 |
| `4da345e6` | 17:10 | 다른 Role로 이동 액션 복구 |
| `ccf24213` | 17:21 | Reject·Accept Intro 및 검토 화면 배치 수정 |
| `21a02066` | 17:30 | 기존 단계 툴팁 복구 |
| `cb09ad10` | 17:33 | info 아이콘 제거, light tooltip 적용 |
| `251f0a3f` | 18:02 | All 기본 선택을 포함한 Home 피드 개선 |
| `296269eb` | 18:11 | Home 왼쪽 전체 영역 배경 구분 |

## 2. 복원할 항목 요약

| 번호 | 복원 대상 | 복원 범위 | 최종 처리 |
| --- | --- | --- | --- |
| R01 | Request Intro 입력 모달 | 제목·후보자 이름 위치·설명·입력 문구·제출 문구 | 복원 완료 |
| R02 | 기존 화면의 Intro 요청 버튼 | 원래 화면별 버튼 이름 | 복원 완료 |
| R03 | Accept Intro 모달 | 이메일 연결·인터뷰 선택지 설명 | 복원 완료 |
| R04 | 기존 후보자 상세 모달의 Intro 패널 | 요청 제목·상태 설명·그에 따른 간격 | 복원 완료 |
| R05 | 기존 모바일 상세 모달 | 프로필 분리 때 빠진 연결 종료·연결 대기로 이동 액션 | 사용자 지시로 현재 상태 유지 |
| R06 | 기존 모바일 상세 모달의 Reject | 원래 색·크기·최소 폭 | 복원 완료 |
| R07 | 기존 카드·모달의 Pass 트리거 | 원래 버튼 크기·색·폭·간격. 드롭다운은 유지 | 사용자 지시로 현재 상태 유지 |
| R08 | 전역 사이드바의 Slack 연결 안내 | 원래 안내 카드·문구·표시 조건 | 사용자 지시로 현재 상태 유지 |
| R09 | 기존 채팅 빈 화면 | 원래 안내 문구 | 사용자 지시로 현재 상태 유지 |
| R10 | Role 인박스 툴바의 기존 정보 | 단계별 수, 영어 단계명, 현재 정렬명을 포함한 툴팁·접근성 이름 | 복원 완료 |
| R11 | Role 인박스의 추천 상태 안내 | 원래 상태 표시와 설명 툴팁 | 사용자 지시로 현재 상태 유지 |
| R12 | 기존 Intro 요청 완료 알림 | 원래 준비 시작·다음 단계 안내 문구 | 사용자 지시로 현재 상태 유지 |
| R13 | UX writing 가이드 | 미승인 변경을 공통 규칙으로 만든 부분 | 복원 완료 |

## 3. 항목별 근거와 복원 경계

### R01. Request Intro 입력 모달 전체 문구와 이름 배치

발생: `7327c8fb`.

근거: [CompanyIntroRequestDialog](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/CompanyIntroDecisionDialogs.tsx:97).

| 위치 | 작업 전 | 현재 |
| --- | --- | --- |
| 제목 | `Request Intro: {candidateName}` / `Request intro: {candidateName}` | `Intro 보내기` / `Send intro` |
| 제목 아래 | `후보자가 수락하면 소개 이메일로 연결하고 연결됨으로 옮겨요.` | 후보자 이름만 표시 |
| 제출 버튼 | `Request Intro` / `Request intro` | `Intro 보내기` / `Send intro` |
| 관심 이유 라벨 | `후보자에게 전할 회사의 관심 이유` | `후보자에게 전할 관심 이유` |
| 관심 이유 placeholder | `예: 지금까지 만든 제품과 초기 팀에서의 오너십이 저희가 찾는 역할과 잘 맞습니다. 특히 … 이야기를 나눠보고 싶습니다.` | `관심 있는 경험, 함께할 역할` |
| 이메일 라벨 | `수락 시 소개 이메일을 받을 회사 이메일` | `수락 시 연결할 팀원 이메일` |
| 관심 이유 미입력 오류 | `후보자에게 전할 회사의 관심 이유를 적어 주세요.` | `관심 이유를 입력해 주세요.` |
| 이메일 미입력 오류 | `후보자가 수락했을 때 CC할 회사 이메일을 입력해 주세요.` | `연결할 팀원 이메일을 입력해 주세요.` |

영어 문구도 함께 바뀌었다. 원래 제목 아래 설명은 `If the candidate accepts, send the intro email and move them to Connected.`, placeholder는 `e.g. Your product work and ownership in early teams stood out. We'd like to discuss this role with you.`, 이메일 라벨은 `Company contact for the intro email`이었다. 두 미입력 오류는 각각 `Tell Harper why you're interested. It will share this with the candidate.`와 `Company contact to CC on the intro email`이었다.

**복원:** 이 모달의 한국어·영어 문구와 후보자 이름의 제목 내 배치를 작업 전으로 되돌린다. 모달 내부를 다시 디자인하라는 요청은 없었다. 새 검토 화면에서 이 기존 모달을 여는 연결은 유지한다. 별도 작업의 중복 제출 방지·오류 처리도 보존한다.

같은 파일에서 삭제한 `CompanyIntroPassDialog`는 복원하지 않는다. Pass를 드롭다운으로 바꾸라는 요청과 직접 연결된 삭제다.

### R02. 기존 카드·상세 모달의 Intro 요청 버튼 이름

발생: `7327c8fb`.

기존 화면들의 다른 문구를 일괄 `Intro 보내기` / `Send intro`로 바꿨다.

| 기존 화면 | 복원할 한국어 / 영어 | 근거 |
| --- | --- | --- |
| 파이프라인 후보자 카드 | `먼저 제안하기` / `Request intro` | [OrgCandidateCard](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgCandidateCard.tsx:351) |
| 원래 보드 카드, 현재 Grid에서 재사용 | `Intro 요청` / `Request intro` | [OrgRoleTalentBoardCard](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:566) |
| 기존 상세 모달의 Intro 결정 패널 | `Request Intro` / `Request intro` | [CompanyIntroDecisionActions](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:403) |
| 기존 상세 모달의 모바일 상단 | `먼저 제안하기` / `Request intro` | [모바일 상단](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:1477) |

**복원:** 원래 존재하던 화면의 이름을 되돌린다. 사용자가 기능을 설명하면서 “Intro 보내기”라고 부른 것을 기존 버튼 전체의 개명 요청으로 해석하지 않는다. 이번에 새로 만든 Home/Role 검토 액션의 문구까지 별도로 재설계하는 작업은 포함하지 않는다.

### R03. Accept Intro 모달의 선택지 설명

발생: `7327c8fb`.

근거: [AcceptIntroDialog](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgCandidateDecisionDialogs.tsx:398).

- `이메일로 연결받기`: `서로 소개받고 이메일로 다음 단계를 이야기해요.`를 빈 문자열로 바꿔 삭제했다.
- `바로 인터뷰 요청`: `후보자가 가능한 시간을 고를 수 있도록 일정 선택 링크를 보내요.`를 `일정 선택 링크 발송`으로 축약했다.
- 영어도 각각 설명 삭제, `Send an availability link`로 축약했다.

**복원:** 원래 두 설명과 표시 방식을 되돌린다. 설명 제거 지시는 Pass 드롭다운에 대한 것이었다. Accept Intro 모달의 선택지를 다시 쓰라는 요청은 없었다. 검토 화면의 handshake 애니메이션·초록색 Accept Intro 버튼과 기존 모달 연결은 유지한다.

### R04. 기존 상세 모달의 Intro 결정·상태 패널

발생: `7327c8fb`.

근거: [CompanyIntroDecisionActions](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:363).

- 요청 전 패널의 `Request Intro:{candidateName}` / `Request intro for {candidateName}` 제목이 삭제됐다.
- 제목 아래 버튼 묶음의 `mt-4` 간격도 함께 없어졌다.
- 요청 후 상태 패널에서 수락·연결 준비 및 다음 단계 설명이 삭제됐다.
- `연결 전에는 추가 연락이나 인터뷰 요청을 할 수 없습니다.`라는 기존 상태 설명도 삭제됐다.

**복원:** 기존 상세 모달에서 표시하던 제목·상태별 설명·간격을 원래대로 돌린다. `closed`, `passed`에는 설명을 표시하지 않던 원래 조건도 보존한다. 여기서 말하는 원래 설명은 작업 전 코드의 복원 기준이며, 이번 조사에서 제품 정책을 새로 검증·규정한 것은 아니다.

Home/Role 인박스의 새 인라인 후보자 화면에 이 패널이나 오른쪽 활동 피드를 추가하라는 뜻은 아니다. 그 화면에서 피드를 없애라는 요청은 그대로 유지한다. 이 패널의 Pass도 드롭다운을 유지한다.

### R05. 기존 모바일 상세 모달의 연결 액션 누락

발생: `ac38bdd6`, 이후에도 미복원.

근거: [기존 액션 함수](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:226), [모바일 상단 표시 조건](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:1315), [분리된 프로필을 사용하는 위치](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:1648).

작업 전 `ProfilePane`는 연결 대기 이외 단계에서 `CandidateDecisionActions`를 `md:hidden`으로 표시했다. 프로필 정보 코드를 `OrgTalentProfile`로 옮기면서 이 호출도 함께 없어졌다.

현재 모바일 상단 액션은 연결 대기 또는 요청 전 회사 Intro에만 나온다. 다른 단계의 결정 액션은 데스크톱 전용 FeedPanel에만 남아 있다. 따라서 기존 모바일 상세 모달에서 다음 동작의 진입점이 빠졌다.

- 진행 중 후보자의 `연결 종료하기`.
- 기존 권한과 상태 조건에서 허용되던 `연결 대기로 이동`.

**복원:** 기존 모바일 상세 모달에만 원래 액션·설명·표시 조건을 복구한다. 정보 전용 프로필 컴포넌트에 액션을 섞거나, 새 인박스에 불필요한 액션을 추가하지 않는다. 기존 권한을 확장하지 않는다. 이는 단순한 문구 취향 문제가 아니라 추출 과정의 기능 누락이다.

### R06. 기존 모바일 상세 모달의 Reject 버튼 스타일

발생: `7327c8fb`.

근거: [모바일 Reject 분기](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:1453).

작업 전에는 `min-w-11`, critical 배경·테두리, 흰 글자, 명시적 `size="md"`를 쓰는 버튼이었다. Pass 분기를 드롭다운으로 교체하면서 연결 대기 Reject까지 `variant="neutral"`로 바뀌었고 기존 스타일 지정이 제거됐다.

**복원:** 기존 모바일 모달의 Reject 버튼만 원래 스타일로 되돌린다. Reject가 원래 거절 모달을 여는 동작은 유지한다. 새 검토 화면 상단 전체를 다시 디자인하는 작업으로 확대하지 않는다.

### R07. Pass 드롭다운 적용 시 바뀐 기존 트리거 스타일

발생: `7327c8fb`의 공통 드롭다운 적용. 기존 Grid 카드 재사용에도 남아 있음.

근거: [OrgPassPopover 트리거](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgPassPopover.tsx:69), [파이프라인 카드](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgCandidateCard.tsx:332), [보드 카드](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:538), [상세 모달](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:390).

새 Popover가 트리거에 `size="md"`, `variant="neutral"`를 고정하면서 다음 차이가 생겼다.

| 위치 | 보존해야 할 기존 모습 | 현재 코드 차이 |
| --- | --- | --- |
| 파이프라인 후보자 카드 | 작은 기본색 버튼, 두 버튼이 각 셀을 채움 | 중간 크기·neutral로 변경. 추가된 div 안에서 버튼 폭을 채우는 지정도 없음 |
| 원래 보드/Grid 카드 | `size="md"`, neutral, `py-2` | 기존 `py-2`가 전달되지 않음 |
| 기존 상세 모달 결정 패널 | `size="md"`, critical | neutral로 변경 |
| 기존 모바일 모달의 회사 Intro Pass | critical 배경·흰 글자·최소 폭 | 공통 neutral 트리거로 변경 |

**복원:** 기존 화면에서 Popover를 여는 버튼의 모양만 원래대로 보존할 수 있게 한다. 새 검토 화면의 Save/Pass/Intro 배치는 유지한다. Pass 드롭다운 자체, 원래 Reject 사유를 재사용한 선택지, 직접 입력·제출은 유지한다. 옛 Pass 확인 모달과 그 설명은 복원하지 않는다. 폭·여백 차이는 코드로 확인했으며 복원 시 해당 카드만 시각 확인하면 된다.

### R08. 전역 사이드바의 Slack 연결 안내 카드

발생: `7327c8fb`.

근거: [OrgSlackConnectionCard](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/workspace/OrgWorkspaceSidebar.tsx:562).

기존에는 테두리·배경·여백이 있는 카드에 Slack 아이콘, `Slack을 연결해 주세요` 제목, `채용 진행 알림과 역할 생성, 기준 변경 등 모든 작업을 Slack으로 할 수 있어요.` 설명, `Slack 연결하기` 버튼이 있었다. 현재는 작은 아이콘과 `Slack 연결`만 있는 투명한 한 줄 버튼이다.

표시 조건도 달라졌다. 원래는 연동 관리 권한이 없어도 안내 카드는 보이고 연결 버튼만 숨겼다. 현재는 권한이 없으면 안내 전체가 사라진다.

**복원:** 카드 형태·한국어/영어 문구·기존 권한별 표시를 되돌린다. Home을 인박스로 바꾸고 전역 Inbox 메뉴를 없애라는 요청은 Slack 안내 변경을 포함하지 않는다. 같은 파일의 Inbox 메뉴 제거, Home 배지 이동, 저장 후보 제외 집계는 유지한다.

### R09. 기존 채팅 빈 화면 문구

발생: `7327c8fb`.

근거: [OrgAgentChatSurface](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/agent/OrgAgentPanel.tsx:410).

- 원래: `역할이나 후보자에 대해 물어보거나 원하시는 사항을 요청해주세요.` / `Ask about a role or candidate, or request what you need.`
- 현재: `어떤 채용 업무를 도와드릴까요?` / `How can I help with hiring?`

**복원:** 기존 문구로 되돌린다. 이 컴포넌트는 기존 채팅 화면에서도 사용한다. 요청한 Home 대체 작업과 공통 채팅의 인사말 변경은 별개다. 예전 Home에 있던 채팅 영역을 다시 Home에 넣지는 않는다.

### R10. Role 인박스 툴바에서 빠지거나 바뀐 기존 정보

발생: `ac38bdd6`의 `OrgRoleInbox` 교체에서 시작. 이후 Grid 재사용 구조에도 남아 있음.

근거: [새 Role 인박스 툴바](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleInbox.tsx:166), [기존 단계별 집계](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:814).

- 단계별 후보자 수: 원래 두 단계 이름 옆에 있던 수가 새 툴바에는 없다. Role 상위 인박스 탭의 총수와는 다른 정보다.
- 영어 단계명: `Ready to connect` → `Inbound`, `Suggested candidates` → `Suggested`로 바뀌었다. 한국어 명칭은 유지돼 있지만 영어 제품 용어만 달라졌다.
- 정렬 아이콘의 `title`·접근성 이름: 원래 `정렬: 최신순` / `정렬: 추천순`처럼 현재 선택값을 포함했으나 현재는 `정렬`만 표시한다.

**복원:** 원래 단계명·단계별 수·정렬 선택값 안내를 새 툴바에 보존한다. 저장함 추가에 따른 후보자 제외 집계와 별도 작업의 열람 권한·잠금 처리는 유지한다. 정렬 오른쪽 View 버튼, History, List/Card/Grid, 스크롤되는 툴바, info 아이콘 없는 light tooltip은 그대로 둔다.

### R11. Role 인박스의 기존 추천 상태 안내 누락

발생: `ac38bdd6`의 화면 교체. `cfbf9363`에서 Grid가 `inboxItems`를 넘기도록 연결된 뒤에도 미복원.

근거: [기존 OrgRoleRecommendationStatus](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:123), [표시 조건](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:702), [새 Grid 호출](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleInbox.tsx:305).

기존 Role 인박스에는 상태에 따라 아래 표시와 light tooltip이 있었다.

- `Harper가 소개하고 있어요`.
- `연결 결정이 필요해요`.
- `후보자 추천 중단`.
- `후보자 추천 종료`.

함수는 남아 있지만 새 List/Card는 이 함수를 렌더하지 않는다. Grid도 `inboxItems`를 넘기는데, 기존 보드는 `!inboxItems`일 때만 상태를 표시한다. 따라서 현재 Role 인박스 세 보기 모두에서 안내가 빠진다.

**복원:** 원래 상태·설명·상태점과 그 표시 조건을 새 인박스에서 보존한다. 기존 추천 상태를 검색 기록으로 대체할 수는 없다. 툴바와 함께 스크롤되게 두고 info 아이콘이나 새 고정 영역을 추가하지 않는다.

### R12. 기존 Intro 요청 완료 알림 문구

발생: `7327c8fb`.

근거: [OrgPipeline](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgPipeline.tsx:692), [OrgRoleTalentBoard](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/OrgRoleTalentBoard.tsx:1066), [TalentDetailSimpleView](/Users/gimhojin/Desktop/harper/harper_beta/src/components/org/TalentDetailSimpleView.tsx:1863).

세 기존 경로에서 `후보자에게 보낼 제안 준비를 시작했습니다. 발송 후 후보자의 답변을 기다립니다.`를 모두 `Intro를 요청했어요.`로 바꿨다. 각 경로의 영어 문구도 `Intro requested.`로 일괄 축약했다.

**복원:** 기존 요청 완료 알림의 원문을 각 호출부 기준으로 되돌린다. 새 UI의 불필요한 설명 점검을 기존 Intro 요청 흐름 전체의 문구 단축으로 확대하지 않는다. 실제 요청 처리나 새 검토 화면의 다음 후보자 이동은 유지한다. Pass 드롭다운의 설명 제거와도 구분한다.

### R13. 미승인 변경을 공통 규칙으로 만든 UX writing 가이드

발생: `7327c8fb`.

근거: [company-side-ux-writing-guide-ko.md](/Users/gimhojin/Desktop/harper/harper_beta/docs/company-side-ux-writing-guide-ko.md:200).

- 기존 보드 버튼 명칭 규칙 `Intro 요청`을 검토 화면·보드 전체의 `Intro 보내기` / `Send intro`로 바꿨다.
- `Intro 입력 창은 후보자 이름, 관심 이유, 수락 시 연결할 팀원 이메일만 보여준다.`를 추가해 미승인 모달 축약을 규칙으로 만들었다.
- `완료 안내와 빈 화면 문구는 한 문장으로 끝내고`를 추가해 이번 화면 밖에도 문구 단축을 적용할 수 있게 만들었다.

**복원:** 기존 버튼 명칭 규칙을 되돌리고, 미승인 Intro 모달 제한은 제거한다. 완료·빈 화면 규칙은 제품 전반의 강제 규칙으로 두지 않으며 필요한 경우 이번에 새로 만든 검토 화면에만 범위를 명시한다. Home 인박스/피드, Save/저장함, Pass 드롭다운, 메모, 검색 기록에 대한 요청 기반 설명은 유지한다. 다른 작업이 추가한 정책·오류 처리 내용은 건드리지 않는다.

## 4. 이미 바로잡았거나, 요청대로 유지할 변경

다음 항목을 예전 코드로 통째로 되돌리면 사용자 요청까지 취소하게 된다.

| 항목 | 유지 근거 및 현재 판단 |
| --- | --- |
| 실제 코드 기반 브랜치 구현 | HTML 목업이 아니라 기존 코드에서 구현하라는 명시적 수정 지시 |
| Home 대체, 전역 Inbox 메뉴 제거 | 최초 요청 1번. 예전 Home 대시보드·채팅·바로가기 및 독립 Inbox 화면을 복원하지 않음 |
| Home 인박스/피드와 Role별 두 종류의 검토 묶음 | 최초 요청 2–5번. 도넛 잔여 수·Top 10도 유지 |
| 오른쪽 후보자 정보, 키보드 액션, Notes | 최초 요청 4·6번. 인박스 후보자 화면의 오른쪽 활동 피드는 다시 추가하지 않음 |
| 프로필 본문 | `cfbf9363`에서 원래 TL;DR, Harper Note, 평가 내용, 소개·경력·학력·기타 활동의 구성과 기존 스타일을 가져오도록 수정됨. 현재 남은 문제는 R05의 기존 모바일 액션 누락 |
| 프로필의 사진·이름·설명·이력서/LinkedIn 배치 | 사용자가 “지금처럼 해도 되긴 하겠다”고 명시적으로 허용. 새 검토 화면의 이 헤더는 유지. 기존 모달은 default 헤더 유지 |
| 새로 만들었던 섹션 이동 메뉴 제거 | “요약/평가 기준/소개/경력/학력/기타 활동/메모” 이동 메뉴를 없애라는 지시 반영. 메뉴를 복원하지 않음 |
| 후보자 이동 버튼 | 기존 pager를 별도 컴포넌트로 옮긴 상태. 기존 UI 유지 |
| List/Card/Grid | List와 Card, 이후 기존 카드 재사용 Grid 추가가 모두 명시적 요청. Grid 카드의 불필요한 변경만 R02·R07에서 복원 |
| 상세 외곽 border·rounded 제거, 스크롤 구조 | 사용자 후속 지시. 단계·정렬·보기·검색 기록 툴바는 스크롤되고 후보자 액션만 sticky 유지 |
| 다른 Role로 이동 아이콘 | `4da345e6`에서 복구. 유지 |
| 연결 대기 Reject와 원래 거절 모달 | `ccf24213`에서 복구. Pass로 바꾸지 않음 |
| Accept Intro의 handshake와 positive-strong | `ccf24213`에서 기존 구현을 공통 컴포넌트로 추출. CSS 파일은 내용 동일한 이름 변경. 유지 |
| Pass 드롭다운과 기존 Reject 사유 재사용 | 명시적 요청. 설명 없는 선택·직접 입력·제출을 유지 |
| Save와 파이프라인 저장함 | 최초 요청 8번. 저장·저장 해제와 관련 집계 유지 |
| 검색 기록 | Role에서 유지하고 Home에서 제거한 상태 유지 |
| Home 오른쪽 시작 높이, 투명한 sticky 액션 영역 | 사용자 후속 지시. 큰 상단 여백·border-b·배경을 다시 넣지 않음 |
| 두 단계 툴팁 | `21a02066` 복구, `cb09ad10`에서 info 아이콘 없는 light tooltip으로 수정. 유지 |
| Home 피드 All 기본 선택·목록 디자인·문구 | 이후 사용자가 이 화면을 별도로 개선해 달라고 명시. 검색·종류별 필터·날짜 묶음 등 이 피드 안의 개선은 복원 대상 아님 |
| Home 왼쪽 전체 배경 | 사용자 명시 요청. 제목·탭·목록·빈 공간을 포함한 배경 유지. `bg-weak`와 `neutral-50` 모두 허용했으므로 그 사이 변경은 복원 대상 아님 |
| 공통 ProfileSection·Header·Tabs·Tooltip | 기존 기본 스타일을 바꾼 전역 재디자인이 아님. 프로필 본문 추출과 선택적 review/light 옵션은 요청 구현에 필요하므로 유지 |

## 5. 변경 파일 전체 확인표

아래는 최초 조사에서 이 채팅의 48개 변경 경로를 빠짐없이 분류한 기록이다. 경로 기준은 저장소 루트다. **이 표의 복원 후보 중 실제 적용한 것은 2절에서 선택된 7개 항목뿐이다.** “유지”는 이번 **디자인 복원 조사**에서 되돌릴 이유가 없다는 뜻이며, 별도 기능·보안 전수 검증 완료를 뜻하지 않는다.

| 변경 파일 | 판정 |
| --- | --- |
| `docs/company-side-ux-writing-guide-ko.md` | R13 부분 복원 |
| `src/app/api/org/activity/route.test.ts` | Home 피드 지원, 유지 |
| `src/app/api/org/activity/route.ts` | Home 피드 지원, 유지 |
| `src/app/api/org/board/route.ts` | Save 표시 지원, 유지 |
| `src/app/api/org/candidate-save/route.test.ts` | Save 지원, 유지 |
| `src/app/api/org/candidate-save/route.ts` | Save 지원, 유지 |
| `src/app/api/org/company-intro/route.ts` | Pass 사유 전달 지원, 유지 |
| `src/app/api/org/search-history/route.ts` | 검색 기록 지원, 유지 |
| `src/components/org/CompanyIntroDecisionDialogs.tsx` | R01 부분 복원. 옛 Pass 모달은 복원하지 않음 |
| `src/components/org/OrgRoleTalentBoard.module.css` → `OrgAcceptIntroButton.module.css` | 내용 동일한 추출, 유지 |
| `src/components/org/OrgAcceptIntroButton.tsx` | 원래 handshake 버튼 추출, 유지 |
| `src/components/org/OrgCandidateCard.tsx` | R02·R07 부분 복원 |
| `src/components/org/OrgCandidateDecisionDialogs.tsx` | R03 복원 |
| `src/components/org/OrgCandidateReview.tsx` | 요청한 인라인 검토 UI, 유지 |
| `src/components/org/OrgCriteriaBars.tsx` | 요청한 6개 세로 막대와 light tooltip, 유지 |
| `src/components/org/OrgHomeFeed.tsx` | 요청한 피드 개선, 유지 |
| `src/components/org/OrgHomeInbox.tsx` | 요청한 Home 대체·배경·배치, 유지 |
| `src/components/org/OrgPassPopover.tsx` | 기능 유지, R07의 호출 화면별 기존 트리거 스타일 보존 필요 |
| `src/components/org/OrgPipeline.tsx` | 저장함·Pass 유지, R12 부분 복원 |
| `src/components/org/OrgRoleInbox.tsx` | 새 보기 유지, R10·R11 기존 정보 보존 필요 |
| `src/components/org/OrgRoleTalentBoard.tsx` | 기존 카드·Save·Pass 유지, R02·R07·R10·R11·R12 관련 부분 복원 |
| `src/components/org/OrgSavedCandidates.tsx` | 요청한 저장함, 유지 |
| `src/components/org/OrgSearchHistory.tsx` | 요청한 검색 기록, 유지 |
| `src/components/org/OrgTalentNotes.tsx` | 요청한 메모, 유지 |
| `src/components/org/OrgTalentProfile.tsx` | 원래 정보 표시 코드 추출 유지. R05는 기존 모달 액션을 별도로 복구 |
| `src/components/org/TalentDetailPager.tsx` | 원래 pager 추출, 유지 |
| `src/components/org/TalentDetailSimpleView.tsx` | 인라인 연결 유지, R02·R04–R07·R12 부분 복원 |
| `src/components/org/agent/OrgAgentPanel.tsx` | R09 복원 |
| `src/components/org/workspace/OrgWorkspaceApp.tsx` | Home 폭·높이 조정, 유지 |
| `src/components/org/workspace/OrgWorkspaceSidebar.tsx` | Inbox 메뉴 변경 유지, R08 부분 복원 |
| `src/components/org/workspace/pages/OrgHomePage.tsx` | Home 대체, 유지 |
| `src/components/org/workspace/pages/OrgInboxPage.tsx` | Home 통합, 유지 |
| `src/components/org/workspace/pages/OrgRoleCreationPage.tsx` | 인박스 연결·스크롤·저장 제외 집계, 유지 |
| `src/components/profile/ProfileSection.tsx` | 원래 스타일 추출, 유지 |
| `src/components/profile/TalentExperienceSection.tsx` | ProfileSection import 경로 변경만, 유지 |
| `src/components/profile/TalentProfileHeader.tsx` | 사용자가 허용한 review 헤더, 기존 default 유지 |
| `src/components/ui/tabs.tsx` | 선택적 light tooltip 지원, 유지 |
| `src/components/ui/tooltip.tsx` | 기존 기본값 유지, light 스타일 재사용 |
| `src/hooks/org/useOrg.ts` | Pass 사유 전달 지원, 유지 |
| `src/hooks/org/useOrgCandidateSave.ts` | Save 지원, 유지 |
| `src/hooks/org/useOrgJobs.tsx` | Home 후보자 검토 연결, 유지 |
| `src/hooks/org/useOrgJobsRoute.ts` | 후보자 선택·뒤로가기·보기 상태 보존, 유지 |
| `src/lib/org/actionLogs.ts` | Pass 사유 기록 지원, 유지 |
| `src/lib/org/candidateSaved.server.ts` | Save 기록 조회 지원, 유지 |
| `src/lib/org/homeActivity.ts` | Home 피드 데이터 계약, 유지 |
| `src/lib/org/server.ts` | Save·Pass 사유·회사 선제 후보 메모 지원, 유지 |
| `src/pages/org/inbox.tsx` | 기존 Inbox URL의 Home 연결, 유지 |
| `src/styles/Design.md` | 요청한 UI와 원래 컴포넌트 보존 규칙, 유지 |

## 6. 실제 복원 시 지킬 범위

1. 파일이나 커밋 전체를 되돌리지 않는다. 특히 `7327c8fb`에는 요청한 Pass 드롭다운 개선과 미승인 변경이 함께 들어 있다.
2. 최종 선택된 R01·R02·R03·R04·R06·R10·R13만 복원한다. R05·R07·R08·R09·R11·R12는 현재 상태로 둔다. 이 목록을 이유로 다른 화면의 디자인을 다시 검토하거나 바꾸지 않는다.
3. 프로필 정보 추출, 새 Home·Role 보기, 저장함, 검색 기록, 피드 개선과 이후 사용자 수정 지시는 보존한다.
4. 현재 같은 파일에 들어 있는 별도 작업의 권한·Free 열람·오류 처리 변경은 보존한다.
5. 복원 검증은 변경한 모달·기존 카드·모바일 액션·사이드바·Role 툴바의 짧은 확인으로 제한한다. 제품 전체의 디자인·문구 재검토로 확대하지 않는다.

## 7. 선택 항목 복원 결과

- R01·R02: Request Intro 모달의 제목·설명·입력 문구와 기존 화면별 요청 버튼 명칭을 복원했다. 새 인라인 검토 화면의 액션 문구는 그대로 두었다.
- R03·R04·R06: Accept Intro 선택지 설명, 기존 상세 모달 Intro 패널의 제목·상태 설명·간격, 기존 모바일 Reject 스타일을 복원했다. R05의 액션 추가와 R07의 Pass 트리거 스타일 변경은 하지 않았다.
- R10: 저장 후보를 제외한 단계별 수, 원래 영어 단계명, 현재 정렬명을 포함한 버튼 안내를 복원했다. 기존 잠금 표시와 light tooltip을 보존했으며 R11의 추천 상태 안내는 추가하지 않았다.
- R13: 미승인 Intro 명칭·모달 축약 규칙과 전역 한 문장 규칙을 제거했다. R09·R12의 현재 짧은 문구는 그대로 두었다.
- 수정한 6개 TSX 파일의 ESLint 오류 0개. 별도 작업의 기존 이미지 요소에 대한 경고 1개는 이번 범위에서 수정하지 않았다.
- Request Intro의 입력 검증·중복 제출 방지와 Accept Intro의 선택지·인터뷰 제출을 합성 데이터로 확인했다. 외부 연락이나 실제 데이터 변경은 하지 않았다. 기존 Accept Intro 테스트가 오래된 버튼명을 찾고 있어, 원본 테스트는 수정하지 않고 임시 검증에서 실제 버튼명으로 실행했다. 두 확인 모두 통과했다.

후속 복원 요청에 따라 위 7개 항목의 제품 코드와 이 문서를 수정했다. 커밋·푸시·배포는 하지 않았다.
